import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../prisma/client.js';
import { prismaItineraryRepository } from './prismaItineraryRepository.js';
import { resetSchema, testDatabaseUrl } from '../testkit/db.js';
import type { PrismaClient } from '../prisma/client.js';

/**
 * RO-02 — o endereço do roteiro é único **dentro** do tenant, não no banco.
 *
 * Contra Postgres real porque as duas metades da regra vivem lá: o unique composto
 * `(tenant_id, slug)`, que é quem de fato impede a repetição, e a Prisma Client Extension,
 * que é quem faz `findBySlug` enxergar só o tenant de quem perguntou. Um repositório de
 * memória diria que a minha ideia do filtro funciona — não que o filtro funciona.
 *
 * O segundo teste é o que importa: se o `findBySlug` enxergasse outro tenant, a conferência
 * de colisão passaria a recusar um endereço livre **por causa de outra empresa**, e de
 * quebra confirmaria a existência daquele roteiro para quem só chutou o nome.
 */
describe('RO-02: o endereço do roteiro é único por tenant', () => {
  let base: PrismaClient;
  let drk: string;
  let outro: string;

  beforeAll(async () => {
    await resetSchema();
    base = createPrismaClient(testDatabaseUrl());
    drk = (await base.tenant.create({ data: { name: 'Drakkar', slug: 'drk' } })).id;
    outro = (await base.tenant.create({ data: { name: 'Outra', slug: 'outra' } })).id;

    for (const tenantId of [drk, outro]) {
      await base.itinerary.create({
        data: { tenantId, name: 'Coxilha Rica', slug: 'coxilha-rica', status: 'active' },
      });
    }
  });

  afterAll(async () => {
    await base.$disconnect();
  });

  it('acha o roteiro pelo endereço', async () => {
    const achado = await prismaItineraryRepository(base).findBySlug(drk, 'coxilha-rica');

    expect(achado?.name).toBe('Coxilha Rica');
    expect(achado?.tenantId).toBe(drk);
  });

  it('não enxerga o roteiro de outro tenant com o mesmo endereço', async () => {
    const achado = await prismaItineraryRepository(base).findBySlug(drk, 'coxilha-rica');

    expect(achado?.tenantId).not.toBe(outro);
  });

  it('endereço livre no tenant devolve null, mesmo existindo no vizinho', async () => {
    await base.itinerary.create({
      data: { tenantId: outro, name: 'Vale Europeu', slug: 'vale-europeu', status: 'active' },
    });

    const achado = await prismaItineraryRepository(base).findBySlug(drk, 'vale-europeu');

    expect(achado).toBeNull();
  });

  it('o banco recusa o mesmo endereço duas vezes no mesmo tenant', async () => {
    await expect(
      base.itinerary.create({
        data: { tenantId: drk, name: 'Outro nome', slug: 'coxilha-rica', status: 'active' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
