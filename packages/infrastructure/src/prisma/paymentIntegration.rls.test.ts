import { beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { resetSchema, testDatabaseUrl, TenantSession } from '../testkit/db.js';

/**
 * PG-01 / SEC-01 — a conexão com o gateway e as cobranças são **dado da equipe**. O token
 * do provedor dá acesso à conta financeira do tenant: nenhum cliente o alcança, e nenhum
 * tenant vê a integração do outro.
 *
 * A cobrança o cliente também não lê por aqui — ele recebe o link pelo canal de contato,
 * não pelo banco (§3.7: a audiência do cliente é a menor possível).
 */

const T = '11111111-1111-1111-1111-111111111111';
const T2 = 'aaaaaaaa-1111-1111-1111-111111111111';
const RESP = '22222222-2222-2222-2222-222222222222';
const ITIN = '55555555-5555-5555-5555-555555555555';
const EVENT = '66666666-6666-6666-6666-666666666666';
const GRP = '77777777-7777-7777-7777-777777777777';
const BOOKING = '88888888-8888-8888-8888-888888888888';

const SEED = `
  INSERT INTO tenants (id, name, slug) VALUES ('${T}', 'Drakkar', 'drk'), ('${T2}', 'Outra', 'outra');
  INSERT INTO customers (id, tenant_id, responsible_id, full_name, cpf, birth_date)
    VALUES ('${RESP}', '${T}', NULL, 'Resp Um', '11111111111', '1985-01-01');
  INSERT INTO itineraries (id, tenant_id, name, slug) VALUES ('${ITIN}', '${T}', 'Coxilha Rica', 'coxilha-rica');
  INSERT INTO schedule_events (id, tenant_id, itinerary_id, start_date, end_date, status)
    VALUES ('${EVENT}', '${T}', '${ITIN}', '2026-06-01', '2026-06-05', 'scheduled');
  INSERT INTO groups (id, tenant_id, schedule_event_id, itinerary_id, name, status, visibility, pricing_mode)
    VALUES ('${GRP}', '${T}', '${EVENT}', '${ITIN}', 'Saída RLS', 'open', 'public', 'itinerary');
  INSERT INTO bookings (id, tenant_id, group_id, responsible_customer_id, status, source)
    VALUES ('${BOOKING}', '${T}', '${GRP}', '${RESP}', 'pending', 'manual');
  INSERT INTO payment_integrations (id, tenant_id, provider, environment, access_token, webhook_token_hash)
    VALUES (gen_random_uuid(), '${T}', 'asaas', 'sandbox', 'cifrado-a', 'hash-a'),
           (gen_random_uuid(), '${T2}', 'asaas', 'sandbox', 'cifrado-b', 'hash-b');
  INSERT INTO payment_charges (id, tenant_id, booking_id, provider, environment, external_id, amount_cents, billing_type, due_date, status)
    VALUES (gen_random_uuid(), '${T}', '${BOOKING}', 'asaas', 'sandbox', 'pay_1', 120000, 'PIX', '2026-05-20', 'pending');
`;

async function count(session: TenantSession, table: string): Promise<number> {
  const rows = await session.rows<{ n: string }>(`SELECT count(*)::int AS n FROM ${table}`);
  return Number(rows[0]?.n ?? -1);
}

describe('PG-01: integração de pagamento e cobranças são da equipe', () => {
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

  it('SEC-01: a equipe lê só a integração do próprio tenant', async () => {
    const s = await TenantSession.open(T);
    try {
      expect(await count(s, 'payment_integrations')).toBe(1);
      expect(await count(s, 'payment_charges')).toBe(1);
    } finally {
      await s.close();
    }
  });

  it('SEC-01: outro tenant não enxerga a integração nem a cobrança', async () => {
    const s = await TenantSession.open(T2);
    try {
      expect(await count(s, 'payment_integrations')).toBe(1); // a própria
      expect(await count(s, 'payment_charges')).toBe(0);
    } finally {
      await s.close();
    }
  });

  it('PC-05: o cliente não chega ao token do gateway nem às cobranças', async () => {
    const s = await TenantSession.openCustomer(T, RESP);
    try {
      expect(await count(s, 'payment_integrations')).toBe(0);
      expect(await count(s, 'payment_charges')).toBe(0);
    } finally {
      await s.close();
    }
  });

  it('uma conexão por provedor e ambiente — reconectar é atualizar, não empilhar', async () => {
    const client = new Client({ connectionString: testDatabaseUrl() });
    await client.connect();
    try {
      await expect(
        client.query(
          `INSERT INTO payment_integrations (id, tenant_id, provider, environment, access_token, webhook_token_hash)
           VALUES (gen_random_uuid(), '${T}', 'asaas', 'sandbox', 'outro', 'wh-c')`,
        ),
      ).rejects.toThrow();
    } finally {
      await client.end();
    }
  });

  it('a mesma cobrança do provedor não entra duas vezes', async () => {
    const client = new Client({ connectionString: testDatabaseUrl() });
    await client.connect();
    try {
      await expect(
        client.query(
          `INSERT INTO payment_charges (id, tenant_id, booking_id, provider, environment, external_id, amount_cents, billing_type, due_date, status)
           VALUES (gen_random_uuid(), '${T}', '${BOOKING}', 'asaas', 'sandbox', 'pay_1', 1, 'PIX', '2026-05-20', 'pending')`,
        ),
      ).rejects.toThrow();
    } finally {
      await client.end();
    }
  });
});
