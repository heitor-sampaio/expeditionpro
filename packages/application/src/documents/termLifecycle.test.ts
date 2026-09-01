import { describe, expect, it } from 'vitest';
import { fakeLegalDocumentRepository } from './legalDocumentRepository.fake.js';
import { saveTermDraft } from './saveTermDraft.js';
import { publishTermVersion } from './publishTermVersion.js';
import { getTermAcceptanceStatus } from './getTermAcceptanceStatus.js';
import { acceptTerm } from './acceptTerm.js';
import { ForbiddenError, BusinessRuleError } from '../errors.js';
import type { RequestContext } from '../context.js';

const owner: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'owner' },
};
const viewer: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u9', role: 'viewer' },
};
const customer = (customerId: string): RequestContext => ({
  tenantId: 'tenant-a',
  actor: { kind: 'customer', userId: `auth-${customerId}`, customerId },
});

function deps() {
  const documents = fakeLegalDocumentRepository();
  let t = 0;
  const clock = () => new Date(Date.UTC(2026, 0, 1, 0, 0, t++));
  return { documents, clock };
}

const draftBody = { markdown: '## Termo\n\nOlá {{cliente_nome}}' };

describe('DOC-01/DOC-02: rascunho e publicação do Termo', () => {
  it('salva rascunho e publica congelando a versão 1', async () => {
    const d = deps();
    await saveTermDraft(d, owner, draftBody);
    const published = await publishTermVersion(d, owner, {
      requiresReacceptance: false,
      changeSummary: 'primeira versão',
    });
    expect(published.versionNumber).toBe(1);
    expect(published.publishedAt).not.toBeNull();
    expect(published.publishedBy).toBe('u1');
  });

  it('viewer não pode editar nem publicar (403)', async () => {
    const d = deps();
    await expect(saveTermDraft(d, viewer, draftBody)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('publicar sem rascunho é recusado', async () => {
    const d = deps();
    await expect(
      publishTermVersion(d, owner, { requiresReacceptance: false, changeSummary: null }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

describe('DOC-04: aceite do cliente e status', () => {
  it('cliente novo precisa aceitar; após aceitar, fica coberto', async () => {
    const d = deps();
    await saveTermDraft(d, owner, draftBody);
    await publishTermVersion(d, owner, { requiresReacceptance: false, changeSummary: null });

    const before = await getTermAcceptanceStatus(d, owner, { customerId: 'cust-1' });
    expect(before.mustAccept).toBe(true);
    expect(before.versionNumber).toBe(1);

    await acceptTerm(d, owner, { customerId: 'cust-1', channel: 'admin' });

    const after = await getTermAcceptanceStatus(d, owner, { customerId: 'cust-1' });
    expect(after.mustAccept).toBe(false);
  });

  it('aceite duplicado do mesmo cliente na mesma versão é recusado', async () => {
    const d = deps();
    await saveTermDraft(d, owner, draftBody);
    await publishTermVersion(d, owner, { requiresReacceptance: false, changeSummary: null });
    await acceptTerm(d, owner, { customerId: 'cust-1', channel: 'admin' });
    await expect(
      acceptTerm(d, owner, { customerId: 'cust-1', channel: 'admin' }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

describe('DOC-03: reaceite conforme a publicação', () => {
  it('nova versão que exige reaceite volta a bloquear quem já aceitou a anterior', async () => {
    const d = deps();
    await saveTermDraft(d, owner, draftBody);
    await publishTermVersion(d, owner, { requiresReacceptance: false, changeSummary: 'v1' });
    await acceptTerm(d, owner, { customerId: 'cust-1', channel: 'admin' });

    // v2 exige reaceite
    await saveTermDraft(d, owner, { markdown: '## Termo v2' });
    const v2 = await publishTermVersion(d, owner, {
      requiresReacceptance: true,
      changeSummary: 'mudança relevante',
    });
    expect(v2.versionNumber).toBe(2);

    const status = await getTermAcceptanceStatus(d, owner, { customerId: 'cust-1' });
    expect(status).toMatchObject({ mustAccept: true, versionNumber: 2 });
  });

  it('nova versão que NÃO exige reaceite mantém coberto quem aceitou a anterior', async () => {
    const d = deps();
    await saveTermDraft(d, owner, draftBody);
    await publishTermVersion(d, owner, { requiresReacceptance: false, changeSummary: 'v1' });
    await acceptTerm(d, owner, { customerId: 'cust-1', channel: 'admin' });

    await saveTermDraft(d, owner, { markdown: '## Termo v2' });
    await publishTermVersion(d, owner, {
      requiresReacceptance: false,
      changeSummary: 'ajuste leve',
    });

    const status = await getTermAcceptanceStatus(d, owner, { customerId: 'cust-1' });
    expect(status.mustAccept).toBe(false);
  });
});

describe('DOC-04: portal — cliente só age por si', () => {
  async function published() {
    const d = deps();
    await saveTermDraft(d, owner, draftBody);
    await publishTermVersion(d, owner, { requiresReacceptance: false, changeSummary: 'v1' });
    return d;
  }

  it('o cliente consulta o próprio status e aceita (canal portal)', async () => {
    const d = await published();
    const status = await getTermAcceptanceStatus(d, customer('cust-1'), { customerId: 'cust-1' });
    expect(status.mustAccept).toBe(true);
    const accepted = await acceptTerm(d, customer('cust-1'), {
      customerId: 'cust-1',
      channel: 'portal',
    });
    expect(accepted.channel).toBe('portal');
    const after = await getTermAcceptanceStatus(d, customer('cust-1'), { customerId: 'cust-1' });
    expect(after.mustAccept).toBe(false);
  });

  it('o cliente não consulta nem aceita por outro (403)', async () => {
    const d = await published();
    await expect(
      getTermAcceptanceStatus(d, customer('cust-1'), { customerId: 'cust-2' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      acceptTerm(d, customer('cust-1'), { customerId: 'cust-2', channel: 'portal' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
