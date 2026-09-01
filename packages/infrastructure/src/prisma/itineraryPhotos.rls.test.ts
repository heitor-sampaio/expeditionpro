import { beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { resetSchema, testDatabaseUrl, TenantSession } from '../testkit/db.js';

/**
 * SEC-01 · §3.5 / RO-01 — isolamento da galeria de fotos do roteiro:
 *   · a equipe vê todas as fotos do próprio tenant (roteiro ativo ou arquivado), nada de outro;
 *   · o cliente lê só as fotos de roteiros **ativos** do seu tenant (navega o catálogo);
 *   · nada cruza de um tenant para o outro.
 */

const TA = 'a0000000-0000-4000-8000-0000000000a1';
const TB = 'b0000000-0000-4000-8000-0000000000b1';
const CUST_A = 'c0000000-0000-4000-8000-0000000000c1';
const CUST_B = 'c0000000-0000-4000-8000-0000000000c2';
const ATIVO = 'd0000000-0000-4000-8000-0000000000d1'; // roteiro ativo do tenant A
const ARQ = 'd0000000-0000-4000-8000-0000000000d2'; // roteiro arquivado do tenant A
const ITB = 'd0000000-0000-4000-8000-0000000000d3'; // roteiro do tenant B

const SEED = `
  INSERT INTO tenants (id, name, slug) VALUES ('${TA}', 'Drakkar', 'drk'), ('${TB}', 'Outra', 'out');
  INSERT INTO customers (id, tenant_id, responsible_id, full_name, cpf, birth_date) VALUES
    ('${CUST_A}', '${TA}', NULL, 'Cliente A', '11111111111', '1985-01-01'),
    ('${CUST_B}', '${TB}', NULL, 'Cliente B', '22222222222', '1986-02-02');

  INSERT INTO itineraries (id, tenant_id, name, slug, status) VALUES
    ('${ATIVO}', '${TA}', 'Ativo', 'ativo', 'active'),
    ('${ARQ}', '${TA}', 'Arquivado', 'arquivado', 'archived'),
    ('${ITB}', '${TB}', 'Do B', 'do-b', 'active');

  INSERT INTO itinerary_photos (id, tenant_id, itinerary_id, storage_path, position, is_cover) VALUES
    (gen_random_uuid(), '${TA}', '${ATIVO}', '${TA}/a1.webp', 0, true),
    (gen_random_uuid(), '${TA}', '${ATIVO}', '${TA}/a2.webp', 1, false),
    (gen_random_uuid(), '${TA}', '${ARQ}', '${TA}/arq.webp', 0, true),
    (gen_random_uuid(), '${TB}', '${ITB}', '${TB}/b1.webp', 0, true);
`;

async function count(session: TenantSession, where: string): Promise<number> {
  const rows = await session.rows<{ n: string }>(
    `SELECT count(*)::int AS n FROM itinerary_photos ${where}`,
  );
  return Number(rows[0]?.n ?? -1);
}

describe('SEC-01 · RO-01: isolamento da galeria de fotos', () => {
  beforeAll(async () => {
    await resetSchema();
    const client = new Client({ connectionString: testDatabaseUrl() });
    await client.connect();
    try {
      await client.query(SEED);
    } finally {
      await client.end();
    }
  });

  it('equipe do tenant A vê todas as fotos do tenant (ativo + arquivado) e nada de B', async () => {
    const s = await TenantSession.open(TA);
    try {
      expect(await count(s, '')).toBe(3);
      expect(await count(s, `WHERE tenant_id = '${TB}'`)).toBe(0);
    } finally {
      await s.close();
    }
  });

  it('cliente lê só as fotos de roteiros ativos do seu tenant', async () => {
    const s = await TenantSession.openCustomer(TA, CUST_A);
    try {
      expect(await count(s, '')).toBe(2); // as duas do roteiro ativo
      const arq = await s.rows(`SELECT 1 FROM itinerary_photos WHERE itinerary_id = '${ARQ}'`);
      expect(arq).toHaveLength(0);
    } finally {
      await s.close();
    }
  });

  it('cliente de outro tenant não lê a galeria do tenant A', async () => {
    const s = await TenantSession.openCustomer(TB, CUST_B);
    try {
      const rows = await s.rows(`SELECT 1 FROM itinerary_photos WHERE tenant_id = '${TA}'`);
      expect(rows).toHaveLength(0);
    } finally {
      await s.close();
    }
  });
});
