import { describe, expect, it } from 'vitest';
import { IntakeValidationError } from '@expedition/domain';
import { fakeApiKeyRepository, fakeIntakeRepository } from './intakeRepository.fake.js';
import { fakeFormMappingRepository } from './formMappingRepository.fake.js';
import { receiveIntake } from './receiveIntake.js';
import { BusinessRuleError, UnauthorizedError } from '../errors.js';

const KEY = {
  token: 'epk_live_drk_teste',
  tenantSlug: 'drk',
  tenantId: 'tenant-a',
  keyId: 'key-1',
  scopes: ['intake:write'],
};

function deps(keyOverrides: Partial<typeof KEY> & { revoked?: boolean; expired?: boolean } = {}) {
  const apiKeys = fakeApiKeyRepository([{ ...KEY, ...keyOverrides }]);
  const intake = fakeIntakeRepository();
  const formMappings = fakeFormMappingRepository();
  return { apiKeys, intake, formMappings };
}

const payload = () => ({
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

describe('IN-01/IN-02: receptor do webhook', () => {
  it('enfileira a inscrição normalizada e devolve queued', async () => {
    const d = deps();
    const result = await receiveIntake(d, {
      tenantSlug: 'drk',
      token: KEY.token,
      source: 'wp_flat_v1',
      rawBody: payload(),
    });
    expect(result.status).toBe('queued');
    expect(d.intake.rows).toHaveLength(1);
    expect(d.intake.rows[0]!.status).toBe('needs_allocation');
    expect(d.intake.rows[0]!.externalId).toBe('4641:7');
    expect(d.apiKeys.touched).toContain('key-1');
  });

  it('IN-02: segunda chegada com mesmo {form_id}:{entry_id} → duplicate, não regrava', async () => {
    const d = deps();
    await receiveIntake(d, {
      tenantSlug: 'drk',
      token: KEY.token,
      source: 'wp_flat_v1',
      rawBody: payload(),
    });
    const again = await receiveIntake(d, {
      tenantSlug: 'drk',
      token: KEY.token,
      source: 'wp_flat_v1',
      rawBody: payload(),
    });
    expect(again.status).toBe('duplicate');
    expect(d.intake.rows).toHaveLength(1);
  });

  it('token ausente → 401 (UnauthorizedError)', async () => {
    const d = deps();
    await expect(
      receiveIntake(d, {
        tenantSlug: 'drk',
        token: undefined,
        source: 'wp_flat_v1',
        rawBody: payload(),
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('token de outro tenant (slug não bate) → 401', async () => {
    const d = deps();
    await expect(
      receiveIntake(d, {
        tenantSlug: 'outro',
        token: KEY.token,
        source: 'wp_flat_v1',
        rawBody: payload(),
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('chave revogada → 401', async () => {
    const d = deps({ revoked: true });
    await expect(
      receiveIntake(d, {
        tenantSlug: 'drk',
        token: KEY.token,
        source: 'wp_flat_v1',
        rawBody: payload(),
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('payload inválido (CPF ruim) → IntakeValidationError (422)', async () => {
    const d = deps();
    const bad = payload();
    bad.fields.resp_cpf = { value: '90000010000' };
    await expect(
      receiveIntake(d, { tenantSlug: 'drk', token: KEY.token, source: 'wp_flat_v1', rawBody: bad }),
    ).rejects.toBeInstanceOf(IntakeValidationError);
  });

  it('IN-05: falha de processamento grava a inscrição como error com o payload preservado', async () => {
    const d = deps();
    const bad = payload();
    bad.fields.resp_cpf = { value: '90000010000' };
    await expect(
      receiveIntake(d, { tenantSlug: 'drk', token: KEY.token, source: 'wp_flat_v1', rawBody: bad }),
    ).rejects.toBeInstanceOf(IntakeValidationError);

    // não perdeu: uma linha em `error`, com externalId (dedup) e a causa registrada
    expect(d.intake.rows).toHaveLength(1);
    const row = d.intake.rows[0]!;
    expect(row.status).toBe('error');
    expect(row.externalId).toBe('4641:7');
    expect(row.error).toBe('resp_cpf: invalid_check_digit');
    expect(row.normalized).toBeNull();
    // corpo cru preservado para reprocessar
    expect(row.payload).toEqual(bad);
    expect(d.apiKeys.touched).toContain('key-1');
  });

  it('IN-05/IN-02: reenvio do mesmo payload com erro → duplicate, não cria segunda linha', async () => {
    const d = deps();
    const bad = payload();
    bad.fields.resp_cpf = { value: '90000010000' };
    const cmd = { tenantSlug: 'drk', token: KEY.token, source: 'wp_flat_v1', rawBody: bad };
    await expect(receiveIntake(d, cmd)).rejects.toBeInstanceOf(IntakeValidationError);
    const again = await receiveIntake(d, cmd);
    expect(again.status).toBe('duplicate');
    expect(d.intake.rows).toHaveLength(1);
  });

  it('IN-20: resolve o roteiro pelo mapa form_id→roteiro e grava no intake', async () => {
    const d = deps();
    await d.formMappings.upsert('tenant-a', 'wp_flat_v1', '4641', 'itin-coxilha');
    await receiveIntake(d, {
      tenantSlug: 'drk',
      token: KEY.token,
      source: 'wp_flat_v1',
      rawBody: payload(),
    });
    expect(d.intake.rows[0]!.itineraryId).toBe('itin-coxilha');
  });

  it('IN-20: sem mapa para o form_id, o roteiro fica null (admin escolhe)', async () => {
    const d = deps();
    await receiveIntake(d, {
      tenantSlug: 'drk',
      token: KEY.token,
      source: 'wp_flat_v1',
      rawBody: payload(),
    });
    expect(d.intake.rows[0]!.itineraryId).toBeNull();
  });

  it('IN-20/IN-05: a inscrição em error também chega com o roteiro resolvido', async () => {
    const d = deps();
    await d.formMappings.upsert('tenant-a', 'wp_flat_v1', '4641', 'itin-coxilha');
    const bad = payload();
    bad.fields.resp_cpf = { value: '90000010000' };
    await expect(
      receiveIntake(d, { tenantSlug: 'drk', token: KEY.token, source: 'wp_flat_v1', rawBody: bad }),
    ).rejects.toBeInstanceOf(IntakeValidationError);
    expect(d.intake.rows[0]!.status).toBe('error');
    expect(d.intake.rows[0]!.itineraryId).toBe('itin-coxilha');
  });

  it('IN-01b: aceita o perfil canonical_v1 (payload aninhado) e enfileira', async () => {
    const d = deps();
    const canonical = {
      form_id: 7001,
      entry_id: 3,
      responsible: {
        full_name: 'Maria Souza',
        cpf: '529.982.247-25',
        birth_date: '1990-04-04',
        email: 'maria@exemplo.com',
        phone: '48988887777',
      },
      companions: [],
    };
    const result = await receiveIntake(d, {
      tenantSlug: 'drk',
      token: KEY.token,
      source: 'canonical_v1',
      rawBody: canonical,
    });
    expect(result.status).toBe('queued');
    expect(d.intake.rows[0]!.status).toBe('needs_allocation');
    expect(d.intake.rows[0]!.externalId).toBe('7001:3');
    expect(d.intake.rows[0]!.source).toBe('canonical_v1');
  });

  it('source não suportado → BusinessRuleError', async () => {
    const d = deps();
    await expect(
      receiveIntake(d, {
        tenantSlug: 'drk',
        token: KEY.token,
        source: 'outro_v9',
        rawBody: payload(),
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });
});
