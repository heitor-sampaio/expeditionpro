import { beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { resetSchema, testDatabaseUrl, TenantSession } from '../testkit/db.js';

/**
 * CP-01..CP-06 / SEC-01 — o cupom é instrumento comercial do tenant e **dado da equipe**.
 * Um cliente que lesse a tabela conheceria todo código promocional em circulação,
 * inclusive os nominais de outra família; um tenant que lesse a do outro conheceria a
 * política de desconto do concorrente.
 *
 * Aqui também moram as travas que o domínio não consegue garantir sozinho: um cupom
 * ativo por inscrição, código único por tenant e percentual dentro de 0..100.
 */

const T = '11111111-1111-1111-1111-111111111111';
const T2 = 'aaaaaaaa-1111-1111-1111-111111111111';
const RESP = '22222222-2222-2222-2222-222222222222';
const ITIN = '55555555-5555-5555-5555-555555555555';
const EVENT = '66666666-6666-6666-6666-666666666666';
const GRP = '77777777-7777-7777-7777-777777777777';
const BOOKING = '88888888-8888-8888-8888-888888888888';
const COUPON = '99999999-9999-9999-9999-999999999999';
const COUPON2 = 'bbbbbbbb-9999-9999-9999-999999999999';

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
  INSERT INTO coupons (id, tenant_id, code, mode, value)
    VALUES ('${COUPON}', '${T}', 'VERAO10', 'percent', 10),
           ('${COUPON2}', '${T2}', 'OUTRO20', 'percent', 20);
  INSERT INTO coupon_redemptions (id, tenant_id, coupon_id, booking_id, customer_id, code, mode, value, discount_cents)
    VALUES (gen_random_uuid(), '${T}', '${COUPON}', '${BOOKING}', '${RESP}', 'VERAO10', 'percent', 10, 26000);
`;

async function count(session: TenantSession, table: string): Promise<number> {
  const rows = await session.rows<{ n: string }>(`SELECT count(*)::int AS n FROM ${table}`);
  return Number(rows[0]?.n ?? -1);
}

async function withClient(run: (client: Client) => Promise<void>): Promise<void> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    await run(client);
  } finally {
    await client.end();
  }
}

describe('CP-01: cupom e resgate são dado da equipe', () => {
  beforeAll(async () => {
    await resetSchema();
    await withClient(async (client) => {
      await client.query(SEED);
    });
  });

  it('SEC-01: a equipe lê só os cupons do próprio tenant', async () => {
    const s = await TenantSession.open(T);
    try {
      expect(await count(s, 'coupons')).toBe(1);
      expect(await count(s, 'coupon_redemptions')).toBe(1);
    } finally {
      await s.close();
    }
  });

  it('SEC-01: outro tenant não enxerga o cupom nem o resgate', async () => {
    const s = await TenantSession.open(T2);
    try {
      expect(await count(s, 'coupons')).toBe(1); // o próprio
      expect(await count(s, 'coupon_redemptions')).toBe(0);
    } finally {
      await s.close();
    }
  });

  it('CP-03: o cliente não lê a tabela de cupons — nem o resgate da própria inscrição', async () => {
    const s = await TenantSession.openCustomer(T, RESP);
    try {
      expect(await count(s, 'coupons')).toBe(0);
      expect(await count(s, 'coupon_redemptions')).toBe(0);
    } finally {
      await s.close();
    }
  });

  it('CP-01: o código é único por tenant, e o mesmo código convive em tenants diferentes', async () => {
    await withClient(async (client) => {
      await expect(
        client.query(
          `INSERT INTO coupons (id, tenant_id, code, mode, value)
           VALUES (gen_random_uuid(), '${T}', 'VERAO10', 'fixed', 5000)`,
        ),
      ).rejects.toThrow();

      await client.query(
        `INSERT INTO coupons (id, tenant_id, code, mode, value)
         VALUES (gen_random_uuid(), '${T2}', 'VERAO10', 'percent', 15)`,
      );
    });
  });

  it('CP-06: uma inscrição não recebe dois cupons ativos', async () => {
    await withClient(async (client) => {
      await expect(
        client.query(
          `INSERT INTO coupon_redemptions (id, tenant_id, coupon_id, booking_id, customer_id, code, mode, value, discount_cents)
           VALUES (gen_random_uuid(), '${T}', '${COUPON}', '${BOOKING}', '${RESP}', 'VERAO10', 'percent', 10, 100)`,
        ),
      ).rejects.toThrow();
    });
  });

  it('CP-08: liberado o resgate, a inscrição aceita outro cupom — e o histórico fica', async () => {
    await withClient(async (client) => {
      await client.query(
        `UPDATE coupon_redemptions SET released_at = now() WHERE booking_id = '${BOOKING}'`,
      );
      await client.query(
        `INSERT INTO coupon_redemptions (id, tenant_id, coupon_id, booking_id, customer_id, code, mode, value, discount_cents)
         VALUES (gen_random_uuid(), '${T}', '${COUPON}', '${BOOKING}', '${RESP}', 'VERAO10', 'percent', 10, 50)`,
      );
      const { rows } = await client.query<{ n: string }>(
        `SELECT count(*)::int AS n FROM coupon_redemptions WHERE booking_id = '${BOOKING}'`,
      );
      expect(Number(rows[0]?.n)).toBe(2);
    });
  });

  it('CP-01: percentual acima de 100 e valor negativo não entram', async () => {
    await withClient(async (client) => {
      await expect(
        client.query(
          `INSERT INTO coupons (id, tenant_id, code, mode, value)
           VALUES (gen_random_uuid(), '${T}', 'IMPOSSIVEL', 'percent', 120)`,
        ),
      ).rejects.toThrow();
      await expect(
        client.query(
          `INSERT INTO coupons (id, tenant_id, code, mode, value)
           VALUES (gen_random_uuid(), '${T}', 'NEGATIVO', 'fixed', -1)`,
        ),
      ).rejects.toThrow();
    });
  });

  it('CP-10: o resgate segura o cupom — apagar cupom usado é recusado', async () => {
    await withClient(async (client) => {
      await expect(client.query(`DELETE FROM coupons WHERE id = '${COUPON}'`)).rejects.toThrow();
    });
  });
});
