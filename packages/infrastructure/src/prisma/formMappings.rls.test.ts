import { beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { resetSchema, testDatabaseUrl, TenantSession } from '../testkit/db.js';

/**
 * SEC-01 — isolamento do `form_mappings` (IN-20). É config de integração, só da equipe:
 *   · um tenant não vê o mapa do outro;
 *   · o cliente não lê nada (sem policy de cliente nesta tabela).
 */

const TA = 'a0000000-0000-4000-8000-000000000101';
const TB = 'b0000000-0000-4000-8000-000000000102';
const ITA = 'a1000000-0000-4000-8000-0000000001a1';
const ITB = 'b1000000-0000-4000-8000-0000000001b1';
const CUSTA = 'c0000000-0000-4000-8000-0000000001c1';

const SEED = `
  INSERT INTO tenants (id, name, slug) VALUES ('${TA}', 'Drakkar', 'drk'), ('${TB}', 'Outra', 'out');
  INSERT INTO customers (id, tenant_id, responsible_id, full_name, cpf, birth_date) VALUES
    ('${CUSTA}', '${TA}', NULL, 'Cliente A', '11111111111', '1985-01-01');
  INSERT INTO itineraries (id, tenant_id, name, slug) VALUES
    ('${ITA}', '${TA}', 'Coxilha Rica', 'coxilha-rica'),
    ('${ITB}', '${TB}', 'Vale Europeu', 'vale-europeu');
  INSERT INTO form_mappings (id, tenant_id, source, form_id, itinerary_id, updated_at) VALUES
    (gen_random_uuid(), '${TA}', 'wp_flat_v1', '4641', '${ITA}', now()),
    (gen_random_uuid(), '${TB}', 'wp_flat_v1', '9999', '${ITB}', now());
`;

async function count(session: TenantSession, sql: string): Promise<number> {
  const rows = await session.rows<{ n: string }>(`SELECT count(*)::int AS n FROM ${sql}`);
  return Number(rows[0]?.n ?? -1);
}

describe('SEC-01/IN-20: isolamento do form_mappings', () => {
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

  it('equipe do tenant A vê só o mapa de A', async () => {
    const s = await TenantSession.open(TA);
    try {
      expect(await count(s, 'form_mappings')).toBe(1);
      const leaked = await s.rows(`SELECT 1 FROM form_mappings WHERE tenant_id = '${TB}'`);
      expect(leaked).toHaveLength(0);
    } finally {
      await s.close();
    }
  });

  it('cliente não lê o form_mappings (config só de equipe)', async () => {
    const s = await TenantSession.openCustomer(TA, CUSTA);
    try {
      expect(await count(s, 'form_mappings')).toBe(0);
    } finally {
      await s.close();
    }
  });
});
