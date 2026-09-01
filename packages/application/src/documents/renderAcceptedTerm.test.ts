import { describe, expect, it } from 'vitest';
import { fakeLegalDocumentRepository } from './legalDocumentRepository.fake.js';
import { renderAcceptedTerm } from './renderAcceptedTerm.js';
import { NotFoundError, ForbiddenError } from '../errors.js';
import type { RequestContext } from '../context.js';

const owner: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'owner' },
};
const customer = (id: string): RequestContext => ({
  tenantId: 'tenant-a',
  actor: { kind: 'customer', userId: `auth-${id}`, customerId: id },
});

async function seed() {
  const documents = fakeLegalDocumentRepository();
  const doc = await documents.ensureTermDocument('tenant-a', 'Termo de Adesão');
  await documents.saveDraft({
    tenantId: 'tenant-a',
    documentId: doc.id,
    contentJson: { markdown: '## Termo' },
    contentHtml: '<h2>Termo</h2>\n<p>{{cliente_nome}} — {{roteiro}} — {{valor_total}}</p>',
  });
  const version = await documents.publishDraft({
    tenantId: 'tenant-a',
    documentId: doc.id,
    requiresReacceptance: false,
    changeSummary: null,
    publishedBy: 'u1',
    publishedAt: new Date(0),
  });
  await documents.recordAcceptance({
    tenantId: 'tenant-a',
    documentVersionId: version.id,
    customerId: 'cust-1',
    bookingId: 'bk-1',
    acceptedAt: new Date('2026-08-11T00:00:00Z'),
    channel: 'site',
    ip: null,
    userAgent: null,
    pdfPath: null,
    variables: { cliente_nome: 'Ana Prado', roteiro: 'Coxilha Rica', valor_total: 'R$ 2.000,00' },
  });
  return { documents };
}

describe('DOC-08: renderizar o contrato aceito sob demanda', () => {
  it('preenche o texto congelado com os valores do snapshot', async () => {
    const { documents } = await seed();
    const result = await renderAcceptedTerm({ documents }, owner, { bookingId: 'bk-1' });
    expect(result.contentHtml).toContain('Ana Prado — Coxilha Rica — R$ 2.000,00');
    expect(result.contentHtml).not.toContain('{{');
    expect(result.versionNumber).toBe(1);
  });

  it('o cliente só vê o próprio contrato (403)', async () => {
    const { documents } = await seed();
    await expect(
      renderAcceptedTerm({ documents }, customer('outro'), { bookingId: 'bk-1' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    // o dono vê
    const ok = await renderAcceptedTerm({ documents }, customer('cust-1'), { bookingId: 'bk-1' });
    expect(ok.contentHtml).toContain('Ana Prado');
  });

  it('inscrição sem aceite não tem contrato (404)', async () => {
    const { documents } = await seed();
    await expect(
      renderAcceptedTerm({ documents }, owner, { bookingId: 'sem-aceite' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
