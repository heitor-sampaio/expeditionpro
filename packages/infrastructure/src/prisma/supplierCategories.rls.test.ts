import { beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { resetSchema, testDatabaseUrl, TenantSession } from '../testkit/db.js';

/**
 * SEC-01 · §3.6 / FO-04 — isolamento das categorias de fornecedor:
 *   · a equipe vê só as categorias do próprio tenant;
 *   · o cliente não lê nada (fornecedor não é dado de cliente);
 *   · nada cruza de um tenant para o outro.
 */

const TA = 'a0000000-0000-4000-8000-0000000000f1';
const TB = 'b0000000-0000-4000-8000-0000000000f2';
const CUST_A = 'c0000000-0000-4000-8000-0000000000f3';

const SEED = `
  INSERT INTO tenants (id, name, slug) VALUES ('${TA}', 'Drakkar', 'drk'), ('${TB}', 'Outra', 'out');
  INSERT INTO customers (id, tenant_id, responsible_id, full_name, cpf, birth_date) VALUES
    ('${CUST_A}', '${TA}', NULL, 'Cliente A', '11111111111', '1985-01-01');
  INSERT INTO supplier_categories (id, tenant_id, name) VALUES
    (gen_random_uuid(), '${TA}', 'Hospedagem'),
    (gen_random_uuid(), '${TA}', 'Transporte'),
    (gen_random_uuid(), '${TB}', 'Alimentação');
`;

async function count(session: TenantSession, where: string): Promise<number> {
  const rows = await session.rows<{ n: string }>(
    `SELECT count(*)::int AS n FROM supplier_categories ${where}`,
  );
  return Number(rows[0]?.n ?? -1);
}

describe('SEC-01 · FO-04: isolamento das categorias de fornecedor', () => {
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

  it('equipe do tenant A vê só as suas categorias, nada do tenant B', async () => {
    const s = await TenantSession.open(TA);
    try {
      expect(await count(s, '')).toBe(2);
      expect(await count(s, `WHERE tenant_id = '${TB}'`)).toBe(0);
    } finally {
      await s.close();
    }
  });

  it('cliente não lê categorias de fornecedor', async () => {
    const s = await TenantSession.openCustomer(TA, CUST_A);
    try {
      expect(await count(s, '')).toBe(0);
    } finally {
      await s.close();
    }
  });
});
