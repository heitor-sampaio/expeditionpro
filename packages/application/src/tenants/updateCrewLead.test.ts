import { describe, expect, it } from 'vitest';
import {
  InvalidCpfError,
  InvalidLocalDateError,
  InvalidPhoneError,
  InvalidPlateError,
  parseLocalDate,
} from '@expedition/domain';
import { fakeTenantRepository } from './tenantRepository.fake.js';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { getCrewLead } from './getCrewLead.js';
import { updateCrewLead, type UpdateCrewLeadCommand } from './updateCrewLead.js';
import { ForbiddenError, RequiredFieldError } from '../errors.js';
import type { RequestContext } from '../context.js';

/**
 * CF-05 — o condutor da empresa em Configurações → Equipe. Antes vivia como constante no
 * código; agora é cadastro do tenant, validado como qualquer dado pessoal do sistema.
 */

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

function command(overrides: Partial<UpdateCrewLeadCommand> = {}): UpdateCrewLeadCommand {
  return {
    fullName: 'Heitor de Oliveira Sampaio',
    cpf: '900.000.100-57',
    birthDate: '1989-01-14',
    email: 'heitorosampaio@gmail.com',
    phone: '(48) 99999-8877',
    address: {
      street: 'Rua Luiz Pasteur',
      number: '509',
      district: 'Trindade',
      city: 'Florianópolis',
      state: 'SC',
      zip: '88036-100',
    },
    vehicle: { brand: 'Ford', model: 'Ranger', plate: 'sfg1h00' },
    companions: [
      { fullName: 'Vanessa Marek Campesatto', birthDate: '1983-03-30' },
      { fullName: 'Enzo Sampaio', birthDate: '2018-08-02' },
    ],
    ...overrides,
  };
}

function setup() {
  const tenants = fakeTenantRepository();
  const audit = fakeAuditLogRepository();
  return { tenants, audit, deps: { tenants, audit } };
}

describe('CF-05: cadastrar o condutor', () => {
  it('guarda tudo normalizado, como o resto do sistema guarda', async () => {
    const { deps } = setup();

    const saved = await updateCrewLead(deps, ctx, command());

    expect(saved).toMatchObject({
      fullName: 'Heitor de Oliveira Sampaio',
      // CPF só com dígitos, telefone em E.164, CEP só com dígitos, placa em caixa alta.
      cpf: '90000010057',
      // E.164 em dígitos, sem o '+', como o cadastro de clientes guarda.
      phone: '5548999998877',
      vehicle: { brand: 'Ford', model: 'Ranger', plate: 'SFG1H00' },
    });
    expect(saved?.birthDate).toEqual(parseLocalDate('1989-01-14'));
    expect(saved?.address.zip).toBe('88036100');
  });

  it('guarda os acompanhantes na ordem, com a data convertida', async () => {
    const { deps } = setup();

    const saved = await updateCrewLead(deps, ctx, command());

    expect(saved?.companions).toEqual([
      { fullName: 'Vanessa Marek Campesatto', birthDate: parseLocalDate('1983-03-30') },
      { fullName: 'Enzo Sampaio', birthDate: parseLocalDate('2018-08-02') },
    ]);
  });

  it('a leitura devolve o que foi guardado', async () => {
    const { deps } = setup();
    await updateCrewLead(deps, ctx, command());

    await expect(getCrewLead(deps, ctx)).resolves.toMatchObject({ cpf: '90000010057' });
  });

  it('sem condutor cadastrado, a leitura devolve nulo', async () => {
    const { deps } = setup();

    await expect(getCrewLead(deps, ctx)).resolves.toBeNull();
  });
});

describe('CF-05: o que o cadastro recusa', () => {
  it('CPF inválido', async () => {
    const { deps } = setup();

    await expect(
      updateCrewLead(deps, ctx, command({ cpf: '111.111.111-11' })),
    ).rejects.toBeInstanceOf(InvalidCpfError);
  });

  it('data de nascimento fora do calendário', async () => {
    const { deps } = setup();

    await expect(
      updateCrewLead(deps, ctx, command({ birthDate: '1989-02-30' })),
    ).rejects.toBeInstanceOf(InvalidLocalDateError);
  });

  it('telefone fora do padrão brasileiro', async () => {
    const { deps } = setup();

    await expect(updateCrewLead(deps, ctx, command({ phone: '123' }))).rejects.toBeInstanceOf(
      InvalidPhoneError,
    );
  });

  it('placa inválida', async () => {
    const { deps } = setup();

    await expect(
      updateCrewLead(
        deps,
        ctx,
        command({ vehicle: { brand: 'Ford', model: 'Ranger', plate: 'X' } }),
      ),
    ).rejects.toBeInstanceOf(InvalidPlateError);
  });

  it('nome em branco — é ele que abre o documento', async () => {
    const { deps } = setup();

    await expect(updateCrewLead(deps, ctx, command({ fullName: '  ' }))).rejects.toBeInstanceOf(
      RequiredFieldError,
    );
  });

  it('acompanhante sem nome ou sem nascimento', async () => {
    const { deps } = setup();

    await expect(
      updateCrewLead(
        deps,
        ctx,
        command({ companions: [{ fullName: '', birthDate: '1983-03-30' }] }),
      ),
    ).rejects.toBeInstanceOf(RequiredFieldError);
  });
});

describe('CF-05: o que é opcional', () => {
  it('sem veículo, o condutor existe e o comboio sai sem ele', async () => {
    const { deps } = setup();

    const saved = await updateCrewLead(deps, ctx, command({ vehicle: null }));

    expect(saved?.vehicle).toBeNull();
  });

  it('sem acompanhantes, a lista fica vazia', async () => {
    const { deps } = setup();

    const saved = await updateCrewLead(deps, ctx, command({ companions: [] }));

    expect(saved?.companions).toEqual([]);
  });

  it('endereço em branco não impede o cadastro — o hotel cobra o titular, não o endereço', async () => {
    const { deps } = setup();

    const saved = await updateCrewLead(
      deps,
      ctx,
      command({
        address: { street: '', number: '', district: '', city: '', state: '', zip: '' },
      }),
    );

    expect(saved?.address).toEqual({
      street: null,
      number: null,
      district: null,
      city: null,
      state: null,
      zip: null,
    });
  });
});

describe('CF-05: quem edita, e o rastro', () => {
  it('operator não edita o condutor', async () => {
    const { deps } = setup();

    await expect(
      updateCrewLead(
        deps,
        { ...ctx, actor: { kind: 'team', userId: 'u2', role: 'operator' } },
        command(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cliente não lê o condutor', async () => {
    const { deps } = setup();

    await expect(
      getCrewLead(deps, { ...ctx, actor: { kind: 'customer', customerId: 'c1', userId: 'u9' } }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('§3.2.1: a trilha registra a mudança sem copiar o dado pessoal', async () => {
    const { deps, audit } = setup();

    await updateCrewLead(deps, ctx, command());

    const entry = audit.rows.find((row) => row.action === 'crew.update');
    expect(entry).toMatchObject({ entity: 'tenant', entityId: 'tenant-a', actorUserId: 'u1' });
    expect(entry?.diff).toEqual({ companions: 2, hasVehicle: true });
    const dump = JSON.stringify(entry?.diff);
    expect(dump).not.toContain('Heitor');
    expect(dump).not.toContain('90000010057');
  });
});
