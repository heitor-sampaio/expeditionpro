import { describe, expect, it } from 'vitest';
import { parseLocalDate, cents } from '@expedition/domain';
import { fakeFormMappingRepository } from './formMappingRepository.fake.js';
import { fakeItineraryRepository } from '../itineraries/itineraryRepository.fake.js';
import { setFormMapping } from './setFormMapping.js';
import { listFormMappings } from './listFormMappings.js';
import { removeFormMapping } from './removeFormMapping.js';
import { ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';

const TENANT = 'tenant-a';
const team = (role: 'owner' | 'admin' | 'operator'): RequestContext => ({
  tenantId: TENANT,
  actor: { kind: 'team', userId: 'u1', role },
});
const customerCtx: RequestContext = {
  tenantId: TENANT,
  actor: { kind: 'customer', customerId: 'c1', userId: 'auth-1' },
};

async function seed() {
  const formMappings = fakeFormMappingRepository();
  const itineraries = fakeItineraryRepository();
  const itin = await itineraries.create(
    {
      tenantId: TENANT,
      name: 'Coxilha Rica',
      slug: 'coxilha-rica',
      description: null,
      difficulty: null,
      status: 'active',
      kind: 'catalog',
      childYoungMaxAge: 5,
      childMidMaxAge: 10,
    },
    {
      validFrom: parseLocalDate('2025-01-01'),
      prices: {
        coupleCents: cents(200000),
        soloCents: cents(120000),
        extraAdultCents: cents(80000),
        childMidCents: cents(60000),
        childYoungCents: cents(40000),
      },
    },
  );
  return { formMappings, itineraries, itineraryId: itin.id };
}

describe('IN-20: mapa form_id → roteiro (Configurações → Integrações)', () => {
  it('owner cria o mapa e listar mostra o roteiro resolvido', async () => {
    const { formMappings, itineraries, itineraryId } = await seed();
    const created = await setFormMapping({ formMappings, itineraries }, team('owner'), {
      source: 'wp_flat_v1',
      formId: '4641',
      itineraryId,
    });
    expect(created.formId).toBe('4641');
    expect(created.itineraryId).toBe(itineraryId);

    const list = await listFormMappings({ formMappings, itineraries }, team('admin'));
    expect(list).toHaveLength(1);
    expect(list[0]!.mapping.formId).toBe('4641');
    expect(list[0]!.itineraryName).toBe('Coxilha Rica');
  });

  it('regravar o mesmo (source, form_id) atualiza o roteiro, não duplica', async () => {
    const { formMappings, itineraries, itineraryId } = await seed();
    const outra = await itineraries.create(
      {
        tenantId: TENANT,
        name: 'Vale Europeu',
        slug: 'vale-europeu',
        description: null,
        difficulty: null,
        status: 'active',
        kind: 'catalog',
        childYoungMaxAge: 5,
        childMidMaxAge: 10,
      },
      {
        validFrom: parseLocalDate('2025-01-01'),
        prices: {
          coupleCents: cents(100000),
          soloCents: cents(60000),
          extraAdultCents: cents(40000),
          childMidCents: cents(30000),
          childYoungCents: cents(20000),
        },
      },
    );
    await setFormMapping({ formMappings, itineraries }, team('owner'), {
      source: 'wp_flat_v1',
      formId: '4641',
      itineraryId,
    });
    await setFormMapping({ formMappings, itineraries }, team('owner'), {
      source: 'wp_flat_v1',
      formId: '4641',
      itineraryId: outra.id,
    });
    const list = await listFormMappings({ formMappings, itineraries }, team('admin'));
    expect(list).toHaveLength(1);
    expect(list[0]!.mapping.itineraryId).toBe(outra.id);
  });

  it('mapear para um roteiro inexistente é recusado', async () => {
    const { formMappings, itineraries } = await seed();
    await expect(
      setFormMapping({ formMappings, itineraries }, team('owner'), {
        source: 'wp_flat_v1',
        formId: '4641',
        itineraryId: 'nao-existe',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('operator não configura o mapa; cliente não lista', async () => {
    const { formMappings, itineraries, itineraryId } = await seed();
    await expect(
      setFormMapping({ formMappings, itineraries }, team('operator'), {
        source: 'wp_flat_v1',
        formId: '4641',
        itineraryId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      listFormMappings({ formMappings, itineraries }, customerCtx),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('remover tira o mapa; remover o que não existe → NotFoundError', async () => {
    const { formMappings, itineraries, itineraryId } = await seed();
    const created = await setFormMapping({ formMappings, itineraries }, team('owner'), {
      source: 'wp_flat_v1',
      formId: '4641',
      itineraryId,
    });
    await removeFormMapping({ formMappings }, team('admin'), { id: created.id });
    expect(await listFormMappings({ formMappings, itineraries }, team('admin'))).toHaveLength(0);
    await expect(
      removeFormMapping({ formMappings }, team('admin'), { id: 'sumiu' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
