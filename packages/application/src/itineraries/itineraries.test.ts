import { describe, it, expect } from 'vitest';
import { BusinessRuleError, NotFoundError } from '../errors.js';
import { createItinerary } from './createItinerary.js';
import { updateItinerary } from './updateItinerary.js';
import { setItineraryPhotos } from './setItineraryPhotos.js';
import { addItineraryPriceVersion } from './addItineraryPriceVersion.js';
import { listItineraryPriceVersions } from './listItineraryPriceVersions.js';
import { resolveItineraryPrices } from './resolveItineraryPrices.js';
import { fakeItineraryRepository } from './itineraryRepository.fake.js';
import type { RequestContext } from '../context.js';

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};

const PRICE = {
  validFrom: '2025-01-01',
  coupleCents: 200000,
  soloCents: 120000,
  extraAdultCents: 80000,
  childMidCents: 60000,
  childYoungCents: 40000,
};

describe('RO-01/02: criar roteiro com faixas e preço', () => {
  it('cria com defaults (kind catalog, faixas 5/10, slug do nome) e a tabela inicial', async () => {
    const itineraries = fakeItineraryRepository();
    const created = await createItinerary({ itineraries }, ctx, {
      name: 'Coxilha Rica',
      prices: PRICE,
    });

    expect(created.slug).toBe('coxilha-rica');
    expect(created.kind).toBe('catalog');
    expect(created.childYoungMaxAge).toBe(5);
    expect(created.childMidMaxAge).toBe(10);
    expect(created.status).toBe('active');
    expect(itineraries.prices).toHaveLength(1);
    expect(itineraries.prices[0]?.prices.coupleCents).toBe(200000);
  });

  it('respeita kind custom e faixas próprias', async () => {
    const itineraries = fakeItineraryRepository();
    const created = await createItinerary({ itineraries }, ctx, {
      name: 'Personalizado',
      kind: 'custom',
      childYoungMaxAge: 4,
      childMidMaxAge: 8,
      prices: PRICE,
    });
    expect(created.kind).toBe('custom');
    expect(created.childYoungMaxAge).toBe(4);
    expect(created.childMidMaxAge).toBe(8);
  });

  it('rejeita faixa etária inconsistente (young >= mid)', async () => {
    const itineraries = fakeItineraryRepository();
    await expect(
      createItinerary({ itineraries }, ctx, {
        name: 'X',
        childYoungMaxAge: 10,
        childMidMaxAge: 5,
        prices: PRICE,
      }),
    ).rejects.toThrow(BusinessRuleError);
  });
});

describe('RO-01/02: editar roteiro', () => {
  async function withItinerary() {
    const itineraries = fakeItineraryRepository();
    const itin = await createItinerary({ itineraries }, ctx, {
      name: 'Coxilha Rica',
      difficulty: 'moderado',
      prices: PRICE,
    });
    return { itineraries, itin };
  }

  it('atualiza nome (com slug novo), descrição, dificuldade, faixas e situação', async () => {
    const { itineraries, itin } = await withItinerary();
    const updated = await updateItinerary({ itineraries }, ctx, {
      id: itin.id,
      name: 'Vale Europeu',
      description: '## Roteiro\nDescida pela serra.',
      difficulty: 'difícil',
      status: 'archived',
      childYoungMaxAge: 4,
      childMidMaxAge: 8,
    });

    expect(updated.name).toBe('Vale Europeu');
    expect(updated.slug).toBe('vale-europeu');
    expect(updated.description).toBe('## Roteiro\nDescida pela serra.');
    expect(updated.difficulty).toBe('difícil');
    expect(updated.status).toBe('archived');
    expect(updated.childYoungMaxAge).toBe(4);
    expect(updated.childMidMaxAge).toBe(8);
  });

  it('preserva campos não informados e limpa descrição em branco para null', async () => {
    const { itineraries, itin } = await withItinerary();
    const updated = await updateItinerary({ itineraries }, ctx, {
      id: itin.id,
      description: '   ',
    });
    expect(updated.name).toBe('Coxilha Rica');
    expect(updated.slug).toBe('coxilha-rica');
    expect(updated.difficulty).toBe('moderado');
    expect(updated.description).toBeNull();
  });

  it('rejeita faixa etária inconsistente (young >= mid)', async () => {
    const { itineraries, itin } = await withItinerary();
    await expect(
      updateItinerary({ itineraries }, ctx, {
        id: itin.id,
        childYoungMaxAge: 9,
        childMidMaxAge: 8,
      }),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('rejeita editar roteiro inexistente', async () => {
    const itineraries = fakeItineraryRepository();
    await expect(
      updateItinerary({ itineraries }, ctx, { id: 'nao-existe', name: 'X' }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('RO-01: galeria de fotos do roteiro (até 20, uma capa)', () => {
  async function withItinerary() {
    const itineraries = fakeItineraryRepository();
    const itin = await createItinerary({ itineraries }, ctx, {
      name: 'Coxilha Rica',
      prices: PRICE,
    });
    return { itineraries, itin };
  }

  const photo = (n: number, isCover = false) => ({
    storagePath: `tenant-a/foto-${n}.webp`,
    isCover,
  });

  it('grava as fotos e promove a primeira a capa quando nenhuma é marcada', async () => {
    const { itineraries, itin } = await withItinerary();
    const saved = await setItineraryPhotos({ itineraries }, ctx, {
      itineraryId: itin.id,
      photos: [photo(1), photo(2), photo(3)],
    });
    expect(saved).toHaveLength(3);
    expect(saved.filter((p) => p.isCover)).toHaveLength(1);
    expect(saved[0]?.isCover).toBe(true);
    expect(saved.map((p) => p.position)).toEqual([0, 1, 2]);
  });

  it('respeita a capa escolhida explicitamente', async () => {
    const { itineraries, itin } = await withItinerary();
    const saved = await setItineraryPhotos({ itineraries }, ctx, {
      itineraryId: itin.id,
      photos: [photo(1), photo(2, true), photo(3)],
    });
    expect(saved[1]?.isCover).toBe(true);
    expect(saved.filter((p) => p.isCover)).toHaveLength(1);
  });

  it('aceita 20 fotos e rejeita a 21ª', async () => {
    const { itineraries, itin } = await withItinerary();
    const saved = await setItineraryPhotos({ itineraries }, ctx, {
      itineraryId: itin.id,
      photos: Array.from({ length: 20 }, (_, i) => photo(i)),
    });
    expect(saved).toHaveLength(20);

    await expect(
      setItineraryPhotos({ itineraries }, ctx, {
        itineraryId: itin.id,
        photos: Array.from({ length: 21 }, (_, i) => photo(i)),
      }),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('rejeita mais de uma capa', async () => {
    const { itineraries, itin } = await withItinerary();
    await expect(
      setItineraryPhotos({ itineraries }, ctx, {
        itineraryId: itin.id,
        photos: [photo(1, true), photo(2, true)],
      }),
    ).rejects.toThrow(BusinessRuleError);
  });

  it('substitui o conjunto: gravar vazio limpa a galeria', async () => {
    const { itineraries, itin } = await withItinerary();
    await setItineraryPhotos({ itineraries }, ctx, {
      itineraryId: itin.id,
      photos: [photo(1)],
    });
    const empty = await setItineraryPhotos({ itineraries }, ctx, {
      itineraryId: itin.id,
      photos: [],
    });
    expect(empty).toHaveLength(0);
  });

  it('rejeita galeria de roteiro inexistente', async () => {
    const itineraries = fakeItineraryRepository();
    await expect(
      setItineraryPhotos({ itineraries }, ctx, { itineraryId: 'nao-existe', photos: [] }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('RO-03: preços versionados por valid_from', () => {
  async function withTwoVersions() {
    const itineraries = fakeItineraryRepository();
    const itin = await createItinerary({ itineraries }, ctx, {
      name: 'Coxilha Rica',
      prices: { ...PRICE, validFrom: '2024-01-01', coupleCents: 100000 },
    });
    await addItineraryPriceVersion({ itineraries }, ctx, {
      itineraryId: itin.id,
      validFrom: '2025-06-01',
      coupleCents: 200000,
      soloCents: 120000,
      extraAdultCents: 80000,
      childMidCents: 60000,
      childYoungCents: 40000,
    });
    return { itineraries, itin };
  }

  it('resolve a versão vigente na data', async () => {
    const { itineraries, itin } = await withTwoVersions();
    const before = await resolveItineraryPrices({ itineraries }, ctx, {
      itineraryId: itin.id,
      atDate: '2025-01-01',
    });
    const after = await resolveItineraryPrices({ itineraries }, ctx, {
      itineraryId: itin.id,
      atDate: '2025-12-01',
    });
    expect(before?.coupleCents).toBe(100000);
    expect(after?.coupleCents).toBe(200000);
  });

  it('rejeita versionar roteiro inexistente', async () => {
    const itineraries = fakeItineraryRepository();
    await expect(
      addItineraryPriceVersion({ itineraries }, ctx, {
        itineraryId: 'nao-existe',
        validFrom: '2025-06-01',
        coupleCents: 200000,
        soloCents: 120000,
        extraAdultCents: 80000,
        childMidCents: 60000,
        childYoungCents: 40000,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('lista todas as versões de preço (histórico de reajuste)', async () => {
    const { itineraries, itin } = await withTwoVersions();
    const versions = await listItineraryPriceVersions({ itineraries }, ctx, {
      itineraryId: itin.id,
    });
    expect(versions).toHaveLength(2);
    const couples = versions.map((v) => v.prices.coupleCents).sort((a, b) => a - b);
    expect(couples).toEqual([100000, 200000]);
  });

  it('rejeita listar versões de roteiro inexistente', async () => {
    const itineraries = fakeItineraryRepository();
    await expect(
      listItineraryPriceVersions({ itineraries }, ctx, { itineraryId: 'nao-existe' }),
    ).rejects.toThrow(NotFoundError);
  });
});
