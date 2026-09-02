import { describe, expect, it } from 'vitest';
import { IntakeValidationError } from '@expedition/domain';
import { fakeIntakeRepository } from './intakeRepository.fake.js';
import { reprocessIntake } from './reprocessIntake.js';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';

const teamCtx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

const validPayload = () => ({
  entry_id: 7,
  form_id: 4641,
  submitted: '2026-08-11T18:57:17-03:00',
  fields: {
    resp_nome: { value: 'Heitor Sampaio' },
    resp_cpf: { value: '90000010057' },
    resp_email: { value: 'a@b.com' },
    resp_telefone: { value: '48999998877' },
    resp_nascimento: { value: '1989-01-14' },
  },
});

/** Semeia uma linha em `error` com o payload cru dado (como se o webhook a tivesse gravado). */
async function seedErrorRow(intake: ReturnType<typeof fakeIntakeRepository>, payload: unknown) {
  const row = await intake.store({
    tenantId: 'tenant-a',
    source: 'wp_flat_v1',
    externalId: '4641:7',
    payload,
    normalized: null,
    formId: '4641',
    submittedAt: null,
    status: 'error',
    error: 'resp_cpf: invalid_check_digit',
    itineraryId: null,
    isTest: false,
  });
  return row.id;
}

describe('IN-05: reprocessar inscrição em erro', () => {
  it('reprocessa com sucesso: mapeia o payload e volta para a fila (needs_allocation)', async () => {
    const intake = fakeIntakeRepository();
    const id = await seedErrorRow(intake, validPayload());

    const result = await reprocessIntake({ intake }, teamCtx, { intakeId: id });

    expect(result.status).toBe('queued');
    const row = intake.rows.find((r) => r.id === id)!;
    expect(row.status).toBe('needs_allocation');
    expect(row.error).toBeNull();
    expect(row.normalized).not.toBeNull();
  });

  it('reprocessamento que ainda falha mantém error e atualiza a mensagem (422)', async () => {
    const intake = fakeIntakeRepository();
    const bad = validPayload();
    bad.fields.resp_email = { value: 'sem-arroba' };
    const id = await seedErrorRow(intake, bad);

    await expect(reprocessIntake({ intake }, teamCtx, { intakeId: id })).rejects.toBeInstanceOf(
      IntakeValidationError,
    );
    const row = intake.rows.find((r) => r.id === id)!;
    expect(row.status).toBe('error');
    expect(row.error).toBe('resp_email: invalid_email');
  });

  it('só reprocessa quem está em error', async () => {
    const intake = fakeIntakeRepository();
    const stored = await intake.store({
      tenantId: 'tenant-a',
      source: 'wp_flat_v1',
      externalId: '4641:8',
      payload: validPayload(),
      normalized: validPayload(),
      formId: '4641',
      submittedAt: null,
      status: 'needs_allocation',
      error: null,
      itineraryId: null,
      isTest: false,
    });
    await expect(
      reprocessIntake({ intake }, teamCtx, { intakeId: stored.id }),
    ).rejects.toMatchObject({ code: 'not_reprocessable' });
    await expect(
      reprocessIntake({ intake }, teamCtx, { intakeId: stored.id }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('inscrição inexistente → NotFoundError', async () => {
    const intake = fakeIntakeRepository();
    await expect(
      reprocessIntake({ intake }, teamCtx, { intakeId: 'nao-existe' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('reprocessar é da equipe (cliente recusado)', async () => {
    const intake = fakeIntakeRepository();
    const id = await seedErrorRow(intake, validPayload());
    const customerCtx: RequestContext = {
      tenantId: 'tenant-a',
      actor: { kind: 'customer', customerId: 'c1', userId: 'auth-1' },
    };
    await expect(reprocessIntake({ intake }, customerCtx, { intakeId: id })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
