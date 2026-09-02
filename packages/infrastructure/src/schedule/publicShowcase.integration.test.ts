import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../prisma/client.js';
import { prismaScheduleRepository } from './prismaScheduleRepository.js';
import { resetSchema, testDatabaseUrl } from '../testkit/db.js';
import type { PrismaClient } from '../prisma/client.js';

/**
 * IN-24 · SEC — o que a vitrine pública mostra.
 *
 * É o único endereço do sistema que responde **sem autenticação nenhuma**: qualquer pessoa
 * na internet, sabendo o slug do tenant, lê essa lista. Por isso o filtro dela não é
 * detalhe de produto, é superfície de exposição.
 *
 * O filtro conferia o **grupo** (aberto, público, não excluído) e nunca o **roteiro**. Um
 * roteiro em `draft` — em preparação, com preço ainda não fechado — aparecia na vitrine se
 * alguém abrisse um grupo público nele. Um `archived` também: o roteiro que a empresa
 * decidiu não vender mais seguia anunciado.
 *
 * É a mesma forma do furo que a RLS da galeria já tinha (`app.active_itinerary_ids`
 * filtrava por status e esquecia `kind`), o que sugere que o par status+kind precisa ser
 * lembrado junto sempre — daí este teste.
 *
 * Roda contra Postgres real porque o filtro vive no SQL: um teste em repositório de memória
 * verificaria a minha ideia do filtro, não o filtro.
 */
describe('IN-24: a vitrine pública só anuncia roteiro ativo de catálogo', () => {
  let base: PrismaClient;
  let tenantId: string;

  let seq = 0;

  async function grupoPublicoCom(status: string, kind: string, nome: string): Promise<void> {
    seq += 1;
    const itinerary = await base.itinerary.create({
      data: { tenantId, name: nome, slug: `roteiro-${seq}`, status, kind },
    });
    const event = await base.scheduleEvent.create({
      data: {
        tenantId,
        itineraryId: itinerary.id,
        startDate: new Date('2026-10-10'),
        endDate: new Date('2026-10-12'),
        status: 'scheduled',
      },
    });
    await base.group.create({
      data: {
        tenantId,
        itineraryId: itinerary.id,
        scheduleEventId: event.id,
        name: nome,
        status: 'open',
        visibility: 'public',
        pricingMode: 'itinerary',
      },
    });
  }

  beforeAll(async () => {
    await resetSchema();
    base = createPrismaClient(testDatabaseUrl());
    tenantId = (await base.tenant.create({ data: { name: 'Drakkar', slug: 'drk' } })).id;

    await grupoPublicoCom('active', 'catalog', 'Coxilha Rica');
    await grupoPublicoCom('draft', 'catalog', 'Rascunho sem preço');
    await grupoPublicoCom('archived', 'catalog', 'Não vendemos mais');
    await grupoPublicoCom('active', 'custom', 'Fechado para empresa');
  });

  afterAll(async () => {
    await base.$disconnect();
  });

  it('mostra o roteiro ativo de catálogo', async () => {
    const grupos = await prismaScheduleRepository(base).listOpenGroupsBySlug('drk');

    expect(grupos.map((g) => g.itineraryName)).toEqual(['Coxilha Rica']);
  });

  it('não anuncia rascunho: preço ainda não está fechado', async () => {
    const grupos = await prismaScheduleRepository(base).listOpenGroupsBySlug('drk');

    expect(grupos.map((g) => g.itineraryName)).not.toContain('Rascunho sem preço');
  });

  it('não anuncia arquivado: a empresa decidiu não vender mais', async () => {
    const grupos = await prismaScheduleRepository(base).listOpenGroupsBySlug('drk');

    expect(grupos.map((g) => g.itineraryName)).not.toContain('Não vendemos mais');
  });

  it('não anuncia roteiro sob medida: é negociado, não é vitrine', async () => {
    const grupos = await prismaScheduleRepository(base).listOpenGroupsBySlug('drk');

    expect(grupos.map((g) => g.itineraryName)).not.toContain('Fechado para empresa');
  });

  it('slug que não existe devolve lista vazia, sem vazar nada', async () => {
    const grupos = await prismaScheduleRepository(base).listOpenGroupsBySlug('outro-tenant');

    expect(grupos).toEqual([]);
  });
});
