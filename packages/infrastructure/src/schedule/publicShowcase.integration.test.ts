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

/**
 * IN-25 — o roteiro de um link público, resolvido pelos dois slugs.
 *
 * O botão do site manda `?roteiro=coxilha-rica`, e quem chega não tem `tenantId` nenhum: é o
 * slug do tenant que o descobre. Este teste existe porque o filtro vive no SQL — em memória eu
 * verificaria a minha ideia do filtro, não o filtro.
 *
 * O par status+kind é o mesmo da vitrine, e pela mesma razão: um roteiro `draft` tem preço
 * ainda não fechado e um `archived` é o que a empresa decidiu não vender mais. Nenhum dos dois
 * pode **receber inscrição** de estranho — que é um estrago maior que aparecer numa lista.
 */
describe('IN-25: o link público resolve tenant e roteiro juntos', () => {
  let base: PrismaClient;
  let tenantId: string;

  async function roteiroCom(
    slug: string,
    status: string,
    kind: string,
    saidas: readonly { inicio: string; grupo: string; visibilidade?: string }[],
  ): Promise<void> {
    const itinerary = await base.itinerary.create({
      data: { tenantId, name: `Roteiro ${slug}`, slug, status, kind },
    });
    for (const saida of saidas) {
      const event = await base.scheduleEvent.create({
        data: {
          tenantId,
          itineraryId: itinerary.id,
          startDate: new Date(saida.inicio),
          endDate: new Date(saida.inicio),
          status: 'scheduled',
        },
      });
      await base.group.create({
        data: {
          tenantId,
          itineraryId: itinerary.id,
          scheduleEventId: event.id,
          name: saida.grupo,
          status: saida.grupo === 'fechada' ? 'closed' : 'open',
          visibility: saida.visibilidade ?? 'public',
          pricingMode: 'itinerary',
        },
      });
    }
  }

  beforeAll(async () => {
    await resetSchema();
    base = createPrismaClient(testDatabaseUrl());
    tenantId = (await base.tenant.create({ data: { name: 'Drakkar', slug: 'drk' } })).id;

    await roteiroCom('coxilha-rica', 'active', 'catalog', [
      { inicio: '2027-01-15', grupo: 'janeiro' },
      { inicio: '2027-02-20', grupo: 'fevereiro' },
      { inicio: '2027-03-10', grupo: 'fechada' },
      { inicio: '2027-04-10', grupo: 'privada', visibilidade: 'private' },
    ]);
    await roteiroCom('rascunho', 'draft', 'catalog', [{ inicio: '2027-01-15', grupo: 'janeiro' }]);
    await roteiroCom('sob-medida', 'active', 'custom', [
      { inicio: '2027-01-15', grupo: 'janeiro' },
    ]);

    // Um roteiro de outro tenant com o MESMO slug: é o que prova que o slug sozinho não basta.
    const outro = (await base.tenant.create({ data: { name: 'Outra', slug: 'outra' } })).id;
    const doOutro = await base.itinerary.create({
      data: { tenantId: outro, name: 'Coxilha da outra', slug: 'coxilha-rica', status: 'active' },
    });
    const eventoDoOutro = await base.scheduleEvent.create({
      data: {
        tenantId: outro,
        itineraryId: doOutro.id,
        startDate: new Date('2027-01-15'),
        endDate: new Date('2027-01-15'),
        status: 'scheduled',
      },
    });
    await base.group.create({
      data: {
        tenantId: outro,
        itineraryId: doOutro.id,
        scheduleEventId: eventoDoOutro.id,
        name: 'da outra empresa',
        status: 'open',
        visibility: 'public',
        pricingMode: 'itinerary',
      },
    });
  });

  afterAll(async () => {
    await base.$disconnect();
  });

  const buscar = (tenantSlug: string, roteiro: string) =>
    prismaScheduleRepository(base).findPublicItineraryBySlug(tenantSlug, roteiro);

  it('acha o roteiro e só as saídas abertas e públicas dele', async () => {
    const achado = await buscar('drk', 'coxilha-rica');

    expect(achado?.itineraryName).toBe('Roteiro coxilha-rica');
    expect(achado?.groups.map((g) => g.name)).toEqual(['janeiro', 'fevereiro']);
  });

  it('as saídas vêm em ordem de data', async () => {
    const achado = await buscar('drk', 'coxilha-rica');

    expect(achado?.groups.map((g) => g.startDate.month)).toEqual([1, 2]);
  });

  it('rascunho não recebe inscrição: o preço ainda não está fechado', async () => {
    expect(await buscar('drk', 'rascunho')).toBeNull();
  });

  it('roteiro sob medida não recebe inscrição: é negociado, não é vitrine', async () => {
    expect(await buscar('drk', 'sob-medida')).toBeNull();
  });

  /** O mesmo slug existe nos dois tenants: quem responde é o dono do link, e ninguém mais. */
  it('o slug do tenant decide de quem é o roteiro', async () => {
    const daOutra = await buscar('outra', 'coxilha-rica');

    expect(daOutra?.itineraryName).toBe('Coxilha da outra');
    expect(daOutra?.groups.map((g) => g.name)).toEqual(['da outra empresa']);
  });

  it('tenant que não existe não acha nada', async () => {
    expect(await buscar('nao-existe', 'coxilha-rica')).toBeNull();
  });

  it('roteiro que não existe naquele tenant não acha nada', async () => {
    expect(await buscar('drk', 'nao-existe')).toBeNull();
  });

  /** Grupo sem evento de agenda não tem data — e sem data não há o que escolher no link. */
  it('grupo sem evento de agenda não entra', async () => {
    const roteiro = await base.itinerary.create({
      data: { tenantId, name: 'Sem agenda', slug: 'sem-agenda', status: 'active' },
    });
    await base.group.create({
      data: {
        tenantId,
        itineraryId: roteiro.id,
        name: 'solto',
        status: 'open',
        visibility: 'public',
        pricingMode: 'itinerary',
      },
    });

    expect((await buscar('drk', 'sem-agenda'))?.groups).toEqual([]);
  });
});
