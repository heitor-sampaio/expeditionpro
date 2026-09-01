import { describe, it, expect } from 'vitest';
import { ForbiddenError, NotFoundError } from '../errors.js';
import { createItinerary } from './createItinerary.js';
import { updateItinerary } from './updateItinerary.js';
import { setItineraryPhotos } from './setItineraryPhotos.js';
import { addItineraryPriceVersion } from './addItineraryPriceVersion.js';
import { listItineraryPriceVersions } from './listItineraryPriceVersions.js';
import { resolveItineraryPrices } from './resolveItineraryPrices.js';
import { listItineraries } from './listItineraries.js';
import { listItineraryPhotos } from './listItineraryPhotos.js';
import { fakeItineraryRepository } from './itineraryRepository.fake.js';
import type { RequestContext } from '../context.js';

/**
 * SEC-01 — audiência do catálogo de roteiros.
 *
 * O servidor usa Prisma com BYPASSRLS: a policy que existe no banco **não protege esta
 * via**. A guarda tem de estar no caso de uso, e até aqui não estava em nenhum dos sete —
 * um token de cliente criava, editava e refotografava roteiro, e lia o catálogo inteiro
 * com a tabela de preços.
 *
 * A regra: escrita é da equipe; leitura do cliente é só a vitrine — `status = 'active'` e
 * `kind = 'catalog'`, porque roteiro personalizado é saída fechada (§3.5.1).
 */

const equipe: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

const cliente: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'customer', userId: 'u2', customerId: 'c1' },
};

const PRICE = {
  validFrom: '2025-01-01',
  coupleCents: 200000,
  soloCents: 120000,
  extraAdultCents: 80000,
  childMidCents: 60000,
  childYoungCents: 40000,
};

async function baseComTres() {
  const itineraries = fakeItineraryRepository();
  const vitrine = await createItinerary({ itineraries }, equipe, {
    name: 'Coxilha Rica',
    prices: PRICE,
  });
  const fechada = await createItinerary({ itineraries }, equipe, {
    name: 'Personalizado',
    kind: 'custom',
    prices: PRICE,
  });
  const arquivado = await createItinerary({ itineraries }, equipe, {
    name: 'Antigo',
    prices: PRICE,
  });
  await updateItinerary({ itineraries }, equipe, { id: arquivado.id, status: 'archived' });
  return { itineraries, vitrine, fechada, arquivado };
}

describe('SEC-01: escrita no catálogo de roteiros é da equipe', () => {
  it('cliente não cria roteiro', async () => {
    const itineraries = fakeItineraryRepository();
    await expect(
      createItinerary({ itineraries }, cliente, { name: 'Meu', prices: PRICE }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cliente não edita roteiro', async () => {
    const { itineraries, vitrine } = await baseComTres();
    await expect(
      updateItinerary({ itineraries }, cliente, { id: vitrine.id, name: 'Trocado' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cliente não troca as fotos', async () => {
    const { itineraries, vitrine } = await baseComTres();
    await expect(
      setItineraryPhotos({ itineraries }, cliente, {
        itineraryId: vitrine.id,
        photos: [{ storagePath: 'x/1.webp', alt: null, isCover: true }],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cliente não lança versão de preço', async () => {
    const { itineraries, vitrine } = await baseComTres();
    await expect(
      addItineraryPriceVersion({ itineraries }, cliente, {
        itineraryId: vitrine.id,
        prices: { ...PRICE, validFrom: '2026-01-01' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('cliente não lê o histórico de preços — é dado interno de reajuste', async () => {
    const { itineraries, vitrine } = await baseComTres();
    await expect(
      listItineraryPriceVersions({ itineraries }, cliente, { itineraryId: vitrine.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('SEC-01 · RO-07: o cliente lê só a vitrine', () => {
  it('a lista do cliente traz só o ativo de catálogo', async () => {
    const { itineraries, vitrine } = await baseComTres();
    const doCliente = await listItineraries({ itineraries }, cliente);
    expect(doCliente.map((i) => i.id)).toEqual([vitrine.id]);
  });

  it('a lista da equipe traz tudo, inclusive personalizado e arquivado', async () => {
    const { itineraries } = await baseComTres();
    expect(await listItineraries({ itineraries }, equipe)).toHaveLength(3);
  });

  it('cliente não lê fotos de roteiro fora da vitrine — e o erro não confirma que ele existe', async () => {
    const { itineraries, fechada } = await baseComTres();
    /*
     * `NotFoundError`, não `ForbiddenError`: 403 diria "existe, mas não é seu", e o
     * personalizado é justamente a saída que ninguém de fora deve saber que existe
     * (CLAUDE.md — 401/404 onde 403 confirmaria existência).
     */
    await expect(
      listItineraryPhotos({ itineraries }, cliente, { itineraryId: fechada.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('cliente lê o preço do roteiro da vitrine — a apresentação mostra', async () => {
    const { itineraries, vitrine } = await baseComTres();
    const tabela = await resolveItineraryPrices({ itineraries }, cliente, {
      itineraryId: vitrine.id,
      atDate: '2025-06-01',
    });
    expect(tabela?.coupleCents).toBe(200000);
  });

  it('cliente não lê o preço de roteiro arquivado nem do personalizado', async () => {
    const { itineraries, fechada, arquivado } = await baseComTres();
    for (const id of [fechada.id, arquivado.id]) {
      await expect(
        resolveItineraryPrices({ itineraries }, cliente, { itineraryId: id, atDate: '2025-06-01' }),
      ).rejects.toBeInstanceOf(NotFoundError);
    }
  });
});
