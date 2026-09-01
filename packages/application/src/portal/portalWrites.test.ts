import { describe, expect, it } from 'vitest';
import { parseCpf, parseLocalDate } from '@expedition/domain';
import { fakeCustomerRepository } from '../customers/customerRepository.fake.js';
import { fakeVehicleRepository } from '../vehicles/vehicleRepository.fake.js';
import { EMPTY_ADDRESS } from '../customers/customerRepository.js';
import { updateCustomerContact } from './updateCustomerContact.js';
import { registerFamilyCompanion } from './registerFamilyCompanion.js';
import { savePortalVehicle } from './savePortalVehicle.js';
import { ForbiddenError } from '../errors.js';
import type { RequestContext } from '../context.js';

const TENANT = 'tenant-a';

async function seed() {
  const customers = fakeCustomerRepository();
  const vehicles = fakeVehicleRepository();
  const resp1 = await customers.create({
    tenantId: TENANT,
    responsibleId: null,
    fullName: 'Resp Um',
    cpf: parseCpf('153.509.460-56'),
    birthDate: parseLocalDate('1985-01-01'),
    email: 'r1@ex.com',
    phone: null,
    address: EMPTY_ADDRESS,
  });
  const comp1 = await customers.create({
    tenantId: TENANT,
    responsibleId: resp1.id,
    fullName: 'Comp Um',
    cpf: parseCpf('277.373.070-44'),
    birthDate: parseLocalDate('1987-02-02'),
    email: null,
    phone: null,
    address: EMPTY_ADDRESS,
  });
  const resp2 = await customers.create({
    tenantId: TENANT,
    responsibleId: null,
    fullName: 'Resp Dois',
    cpf: parseCpf('500.400.300-91'),
    birthDate: parseLocalDate('1990-03-03'),
    email: null,
    phone: null,
    address: EMPTY_ADDRESS,
  });
  return { customers, vehicles, resp1, comp1, resp2 };
}

function customerCtx(customerId: string): RequestContext {
  return { tenantId: TENANT, actor: { kind: 'customer', customerId, userId: 'u1' } };
}

describe('PC-06/PC-08: escrita do cliente (portal), mediada pelo servidor', () => {
  it('PC-06: o cliente edita o próprio contato e endereço; identidade fica intacta', async () => {
    const { customers, resp1 } = await seed();
    const updated = await updateCustomerContact({ customers }, customerCtx(resp1.id), {
      customerId: resp1.id,
      phone: '48999990000',
      address: { ...EMPTY_ADDRESS, city: 'Florianópolis', state: 'SC' },
    });
    expect(updated.phone).toBe('5548999990000'); // normalizado para E.164 (§3.2)
    expect(updated.address.city).toBe('Florianópolis');
    expect(updated.fullName).toBe('Resp Um'); // identidade não muda (PC-07)
    expect(updated.cpf).toBe(resp1.cpf);
  });

  it('PC-06: o cliente edita o contato de um acompanhante da própria família', async () => {
    const { customers, resp1, comp1 } = await seed();
    const updated = await updateCustomerContact({ customers }, customerCtx(resp1.id), {
      customerId: comp1.id,
      email: 'comp@ex.com',
    });
    expect(updated.email).toBe('comp@ex.com');
  });

  it('PC-06: o cliente NÃO edita o contato de outra família', async () => {
    const { customers, resp1, resp2 } = await seed();
    await expect(
      updateCustomerContact({ customers }, customerCtx(resp1.id), {
        customerId: resp2.id,
        phone: '11111111111',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('PC-08: o cliente cadastra um acompanhante novo sob a própria família', async () => {
    const { customers, resp1 } = await seed();
    const companion = await registerFamilyCompanion({ customers }, customerCtx(resp1.id), {
      fullName: 'Filho',
      cpf: '52998224725',
      birthDate: '2015-05-05',
    });
    expect(companion.responsibleId).toBe(resp1.id);
    expect(companion.fullName).toBe('Filho');
  });

  it('PC-08: um acompanhante cadastra sob o responsável da família (o head)', async () => {
    const { customers, resp1, comp1 } = await seed();
    const companion = await registerFamilyCompanion({ customers }, customerCtx(comp1.id), {
      fullName: 'Outro',
      cpf: '70060050004',
      birthDate: '2016-06-06',
    });
    expect(companion.responsibleId).toBe(resp1.id); // sob o head, não sob o acompanhante
  });

  it('PC-06: o cliente anexa veículo a um membro da família, mas não a outra família', async () => {
    const { customers, vehicles, resp1, resp2 } = await seed();
    const vehicle = await savePortalVehicle({ customers, vehicles }, customerCtx(resp1.id), {
      customerId: resp1.id,
      plate: 'ABC1D23',
    });
    expect(vehicle.customerId).toBe(resp1.id);

    await expect(
      savePortalVehicle({ customers, vehicles }, customerCtx(resp1.id), {
        customerId: resp2.id,
        plate: 'XYZ9Z99',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('ator de integração não escreve pelo portal', async () => {
    const { customers, resp1 } = await seed();
    const integrationCtx: RequestContext = {
      tenantId: TENANT,
      actor: { kind: 'integration', apiKeyId: 'k1', scopes: ['intake:write'] },
    };
    await expect(
      updateCustomerContact({ customers }, integrationCtx, {
        customerId: resp1.id,
        phone: '48999990000',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
