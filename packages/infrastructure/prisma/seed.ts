import { VEHICLE_CATALOG, ITINERARIES } from '../src/catalog/catalog.js';
import { createPrismaClient } from '../src/prisma/client.js';

// tsx não carrega .env sozinho; Node 24 tem carregador nativo.
try {
  process.loadEnvFile();
} catch {
  // sem .env local — segue com o ambiente
}

/**
 * Seed do catálogo (Anexos A e B do PRD). Idempotente: roda quantas vezes quiser
 * sem duplicar. Semeia o tenant zero (Drakkar), o catálogo de veículos e os
 * roteiros. Os dados vivem em src/catalog/catalog.ts, verificados contra o Anexo A
 * pelo teste de contrato (catalog.test.ts).
 */

const TENANT = { name: 'Drakkar Expedições', slug: 'drk' };

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  try {
    const tenant = await prisma.tenant.upsert({
      where: { slug: TENANT.slug },
      update: { name: TENANT.name },
      create: TENANT,
    });
    const tenantId = tenant.id;

    let brandCount = 0;
    let modelCount = 0;
    for (const [brandName, models] of Object.entries(VEHICLE_CATALOG)) {
      const brand = await prisma.vehicleBrand.upsert({
        where: { tenantId_name: { tenantId, name: brandName } },
        update: {},
        create: { tenantId, name: brandName },
      });
      brandCount += 1;
      for (const modelName of models) {
        await prisma.vehicleModel.upsert({
          where: { tenantId_brandId_name: { tenantId, brandId: brand.id, name: modelName } },
          update: {},
          create: { tenantId, brandId: brand.id, name: modelName },
        });
        modelCount += 1;
      }
    }

    let itineraryCount = 0;
    for (const name of ITINERARIES) {
      const slug = slugify(name);
      await prisma.itinerary.upsert({
        where: { tenantId_slug: { tenantId, slug } },
        update: {},
        create: {
          tenantId,
          name,
          slug,
          kind: name === 'Personalizado' ? 'custom' : 'catalog',
          status: 'active',
        },
      });
      itineraryCount += 1;
    }

    console.log(
      `Seed concluído: tenant ${TENANT.slug}, ${brandCount} marcas, ${modelCount} modelos, ${itineraryCount} roteiros.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Falha no seed:', error);
  process.exitCode = 1;
});
