import { beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { resetSchema, testDatabaseUrl, TenantSession } from '../testkit/db.js';

/**
 * AU-10 — automação é **só da equipe**, e nenhum tenant vê a do outro.
 *
 * O que está aqui é a régua de como a empresa reage a cliente: que mensagem sai sozinha, em
 * que condição, com que espera. Para um concorrente é a operação inteira em texto; para o
 * cliente é algo que ele nem deveria saber que existe.
 *
 * Roda contra Postgres real porque é a policy que está sendo provada.
 */

const T = '11111111-1111-1111-1111-111111111111';
const T2 = 'aaaaaaaa-1111-1111-1111-111111111111';
const RESP = '22222222-2222-2222-2222-222222222222';

const SEED = `
  INSERT INTO tenants (id, name, slug) VALUES ('${T}', 'Drakkar', 'drk'), ('${T2}', 'Outra', 'outra');
  INSERT INTO customers (id, tenant_id, responsible_id, full_name, cpf, birth_date)
    VALUES ('${RESP}', '${T}', NULL, 'Resp Um', '11111111111', '1985-01-01');
  INSERT INTO automations (id, tenant_id, name, trigger_type)
    VALUES (gen_random_uuid(), '${T}', 'Follow-up de proposta', 'opportunity_moved'),
           (gen_random_uuid(), '${T2}', 'Segredo da concorrente', 'message_received');
`;

async function count(session: TenantSession, table: string): Promise<number> {
  const rows = await session.rows<{ n: string }>(`SELECT count(*)::int AS n FROM ${table}`);
  return Number(rows[0]?.n ?? -1);
}

describe('AU-10: automação é da equipe, e de um tenant só', () => {
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

  it('a equipe lê só as automações do próprio tenant', async () => {
    const s = await TenantSession.open(T);
    try {
      expect(await count(s, 'automations')).toBe(1);
    } finally {
      await s.close();
    }
  });

  it('o outro tenant não vê as daqui — é a operação da empresa em texto', async () => {
    const s = await TenantSession.open(T2);
    try {
      const nomes = await s.rows<{ name: string }>('SELECT name FROM automations');
      expect(nomes.map((r) => r.name)).toEqual(['Segredo da concorrente']);
    } finally {
      await s.close();
    }
  });

  it('o cliente não vê automação nenhuma', async () => {
    const s = await TenantSession.openCustomer(T, RESP);
    try {
      expect(await count(s, 'automations')).toBe(0);
    } finally {
      await s.close();
    }
  });

  it('o cliente também não cria', async () => {
    const s = await TenantSession.openCustomer(T, RESP);
    try {
      await expect(
        s.rows(
          `INSERT INTO automations (id, tenant_id, name, trigger_type)
           VALUES (gen_random_uuid(), '${T}', 'Invadida', 'message_received')`,
        ),
      ).rejects.toThrow();
    } finally {
      await s.close();
    }
  });

  it('nome repetido no mesmo tenant é recusado — dois iguais viram engano', async () => {
    const client = new Client({ connectionString: testDatabaseUrl() });
    await client.connect();
    try {
      await expect(
        client.query(
          `INSERT INTO automations (id, tenant_id, name, trigger_type)
           VALUES (gen_random_uuid(), '${T}', 'Follow-up de proposta', 'message_received')`,
        ),
      ).rejects.toThrow();
    } finally {
      await client.end();
    }
  });
});
