import { describe, expect, it } from 'vitest';
import { InvalidCnpjError, InvalidCompanyLogoError } from '@expedition/domain';
import { fakeTenantRepository } from './tenantRepository.fake.js';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { getCompany } from './getCompany.js';
import { updateCompany } from './updateCompany.js';
import { ForbiddenError, RequiredFieldError } from '../errors.js';
import type { RequestContext } from '../context.js';

/**
 * CF-01 — a identidade da empresa: razão social, CNPJ e logo. É o que sai no cabeçalho
 * da roomlist e na marca da navegação, então editar exige owner ou admin e vai para a
 * trilha.
 */

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function setup() {
  const tenants = fakeTenantRepository({
    name: 'Drakkar Expedições',
    cnpj: null,
    slug: 'drk',
    logo: null,
  });
  const audit = fakeAuditLogRepository();
  return { tenants, audit, deps: { tenants, audit } };
}

describe('CF-01: ler a identidade da empresa', () => {
  it('devolve o que está guardado, para a tela preencher o formulário', async () => {
    const { deps } = setup();

    await expect(getCompany(deps, ctx)).resolves.toMatchObject({
      name: 'Drakkar Expedições',
      cnpj: null,
      logo: null,
    });
  });

  it('cliente não lê a configuração da empresa', async () => {
    const { deps } = setup();

    await expect(
      getCompany(deps, { ...ctx, actor: { kind: 'customer', customerId: 'c1', userId: 'u9' } }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('CF-01: editar a identidade', () => {
  it('salva razão social, CNPJ e logo', async () => {
    const { deps } = setup();

    const saved = await updateCompany(deps, ctx, {
      name: '  Drakkar Expedições ',
      cnpj: '19.131.243/0001-97',
      logo: PNG,
    });

    // CNPJ guardado só com dígitos, como o resto do sistema guarda documento.
    expect(saved).toMatchObject({ name: 'Drakkar Expedições', cnpj: '19131243000197', logo: PNG });
  });

  it('CNPJ inválido é recusado antes de salvar', async () => {
    const { deps } = setup();

    await expect(
      updateCompany(deps, ctx, { name: 'Drakkar', cnpj: '11.111.111/1111-11' }),
    ).rejects.toBeInstanceOf(InvalidCnpjError);
  });

  it('CNPJ em branco limpa o campo — nem toda empresa tem, e o documento vive sem', async () => {
    const { deps, tenants } = setup();
    await updateCompany(deps, ctx, { name: 'Drakkar', cnpj: '19131243000197' });

    const saved = await updateCompany(deps, ctx, { name: 'Drakkar', cnpj: '  ' });

    expect(saved.cnpj).toBeNull();
    expect(tenants.company.cnpj).toBeNull();
  });

  it('razão social em branco é recusada — é o que identifica a empresa no documento', async () => {
    const { deps } = setup();

    await expect(updateCompany(deps, ctx, { name: '   ' })).rejects.toBeInstanceOf(
      RequiredFieldError,
    );
  });

  it('imagem fora de PNG/JPG é recusada', async () => {
    const { deps } = setup();

    await expect(
      updateCompany(deps, ctx, { name: 'Drakkar', logo: 'data:image/webp;base64,UklGRh4A' }),
    ).rejects.toBeInstanceOf(InvalidCompanyLogoError);
  });

  it('logo nula remove a que existia', async () => {
    const { deps } = setup();
    await updateCompany(deps, ctx, { name: 'Drakkar', logo: PNG });

    const saved = await updateCompany(deps, ctx, { name: 'Drakkar', logo: null });

    expect(saved.logo).toBeNull();
  });

  it('campo ausente preserva o valor — salvar o nome não apaga a logo', async () => {
    const { deps } = setup();
    await updateCompany(deps, ctx, { name: 'Drakkar', logo: PNG });

    const saved = await updateCompany(deps, ctx, { name: 'Drakkar Expedições' });

    expect(saved.logo).toBe(PNG);
    expect(saved.name).toBe('Drakkar Expedições');
  });
});

describe('CF-01: quem edita, e o rastro', () => {
  it('operator não edita a empresa', async () => {
    const { deps } = setup();

    await expect(
      updateCompany(
        deps,
        { ...ctx, actor: { kind: 'team', userId: 'u2', role: 'operator' } },
        { name: 'Outra' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('§3.2.1: a trilha diz o que mudou, sem carregar a imagem junto', async () => {
    const { deps, audit } = setup();

    await updateCompany(deps, ctx, { name: 'Drakkar Expedições', logo: PNG });

    const entry = audit.rows.find((row) => row.action === 'company.update');
    expect(entry).toMatchObject({ entity: 'tenant', entityId: 'tenant-a', actorUserId: 'u1' });
    // A logo é grande e não é dado de investigação: a trilha registra que mudou, não o quê.
    expect(entry?.diff).toEqual({ fields: ['logo'] });
    expect(JSON.stringify(entry?.diff)).not.toContain('base64');
  });

  it('sem mudança nenhuma, não escreve na trilha', async () => {
    const { deps, audit } = setup();

    await updateCompany(deps, ctx, { name: 'Drakkar Expedições' });

    expect(audit.rows.some((row) => row.action === 'company.update')).toBe(false);
  });
});
