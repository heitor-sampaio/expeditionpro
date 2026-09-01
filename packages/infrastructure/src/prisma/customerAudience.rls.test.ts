import { beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { resetSchema, testDatabaseUrl, TenantSession } from '../testkit/db.js';

/**
 * PC-05 / §3.7 — a audiência do cliente (`role = customer`) enxerga **só a própria
 * família** e NUNCA custo de fornecedor, margem ou dado de outra família. É garantido
 * por RLS, não por rota. Prova por sessão de papel contra Postgres real (uma sessão de
 * cliente, uma de equipe), como manda o `nova-tabela`.
 */

const T = '11111111-1111-1111-1111-111111111111';
const RESP1 = '22222222-2222-2222-2222-222222222222';
const COMP1 = '33333333-3333-3333-3333-333333333333';
const RESP2 = '44444444-4444-4444-4444-444444444444';
const ITIN = '55555555-5555-5555-5555-555555555555';
const EVENT = '66666666-6666-6666-6666-666666666666';
const GRP = '77777777-7777-7777-7777-777777777777';
const BOOKING = '88888888-8888-8888-8888-888888888888';
const SUPPLIER = '99999999-9999-9999-9999-999999999999';

const SEED = `
  INSERT INTO tenants (id, name, slug) VALUES ('${T}', 'Drakkar', 'drk');
  INSERT INTO customers (id, tenant_id, responsible_id, full_name, cpf, birth_date) VALUES
    ('${RESP1}', '${T}', NULL, 'Resp Um', '11111111111', '1985-01-01'),
    ('${COMP1}', '${T}', '${RESP1}', 'Comp Um', '22222222222', '1987-02-02'),
    ('${RESP2}', '${T}', NULL, 'Resp Dois', '33333333333', '1990-03-03');
  INSERT INTO itineraries (id, tenant_id, name) VALUES ('${ITIN}', '${T}', 'Coxilha Rica');
  INSERT INTO schedule_events (id, tenant_id, itinerary_id, start_date, end_date, status)
    VALUES ('${EVENT}', '${T}', '${ITIN}', '2026-06-01', '2026-06-05', 'scheduled');
  INSERT INTO groups (id, tenant_id, schedule_event_id, itinerary_id, name, status, visibility, pricing_mode)
    VALUES ('${GRP}', '${T}', '${EVENT}', '${ITIN}', 'Saída RLS', 'open', 'public', 'itinerary');
  INSERT INTO bookings (id, tenant_id, group_id, responsible_customer_id, status, source)
    VALUES ('${BOOKING}', '${T}', '${GRP}', '${RESP1}', 'confirmed', 'manual');
  INSERT INTO booking_participants (id, tenant_id, booking_id, customer_id, price_category, unit_price_cents, price_source)
    VALUES (gen_random_uuid(), '${T}', '${BOOKING}', '${RESP1}', 'COUPLE', 200000, 'auto');
  INSERT INTO booking_payments (id, tenant_id, booking_id, paid_at, amount_cents, method)
    VALUES (gen_random_uuid(), '${T}', '${BOOKING}', '2026-05-01', 50000, 'pix');
  INSERT INTO cashback_entries (id, tenant_id, customer_id, booking_id, type, amount_cents)
    VALUES (gen_random_uuid(), '${T}', '${RESP1}', '${BOOKING}', 'accrual', 5000);
  INSERT INTO suppliers (id, tenant_id, name) VALUES ('${SUPPLIER}', '${T}', 'Pousada X');
  INSERT INTO supplier_expenses (id, tenant_id, group_id, supplier_id, description, total_cents)
    VALUES (gen_random_uuid(), '${T}', '${GRP}', '${SUPPLIER}', 'Hosp', 120000);
  INSERT INTO identity_change_requests (id, tenant_id, customer_id, status, full_name)
    VALUES (gen_random_uuid(), '${T}', '${RESP1}', 'pending', 'Resp Um Prado');
`;

async function count(session: TenantSession, table: string): Promise<number> {
  const rows = await session.rows<{ n: string }>(`SELECT count(*)::int AS n FROM ${table}`);
  return Number(rows[0]?.n ?? -1);
}

describe('PC-05 / §3.7: audiência do cliente na RLS', () => {
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

  it('PC-05: o cliente enxerga só a própria família (self + acompanhante), não outra família', async () => {
    const s = await TenantSession.openCustomer(T, RESP1);
    try {
      expect(await count(s, 'customers')).toBe(2); // resp1 + comp1
      const other = await s.rows(`SELECT 1 FROM customers WHERE id = '${RESP2}'`);
      expect(other).toHaveLength(0);
    } finally {
      await s.close();
    }
  });

  it('PC-05: o cliente enxerga a própria inscrição e o financeiro dela, e nada mais', async () => {
    const s = await TenantSession.openCustomer(T, RESP1);
    try {
      expect(await count(s, 'bookings')).toBe(1);
      expect(await count(s, 'booking_participants')).toBe(1);
      expect(await count(s, 'booking_payments')).toBe(1);
      expect(await count(s, 'cashback_entries')).toBe(1);
    } finally {
      await s.close();
    }
  });

  it('PC-05: o cliente NUNCA lê fornecedor, despesa de fornecedor nem chave de API', async () => {
    const s = await TenantSession.openCustomer(T, RESP1);
    try {
      expect(await count(s, 'suppliers')).toBe(0);
      expect(await count(s, 'supplier_expenses')).toBe(0);
      expect(await count(s, 'supplier_payments')).toBe(0);
      expect(await count(s, 'api_keys')).toBe(0);
    } finally {
      await s.close();
    }
  });

  it('§3.7: o cliente lê só o contexto da própria saída (1 roteiro, não o catálogo)', async () => {
    const s = await TenantSession.openCustomer(T, RESP1);
    try {
      expect(await count(s, 'groups')).toBe(1);
      expect(await count(s, 'schedule_events')).toBe(1);
      expect(await count(s, 'itineraries')).toBe(1);
    } finally {
      await s.close();
    }
  });

  it('§3.7: a escrita do cliente é negada pela RLS (portal escreve pelo servidor)', async () => {
    const s = await TenantSession.openCustomer(T, RESP1);
    try {
      await expect(
        s.rows(
          `INSERT INTO vehicles (id, tenant_id, customer_id, plate) VALUES (gen_random_uuid(), '${T}', '${RESP1}', 'ZZZ9Z99')`,
        ),
      ).rejects.toThrow();
    } finally {
      await s.close();
    }
  });

  it('PC-07: o cliente vê o próprio pedido de identidade; outra família, nenhum', async () => {
    const s1 = await TenantSession.openCustomer(T, RESP1);
    try {
      expect(await count(s1, 'identity_change_requests')).toBe(1);
    } finally {
      await s1.close();
    }
    const s2 = await TenantSession.openCustomer(T, RESP2);
    try {
      expect(await count(s2, 'identity_change_requests')).toBe(0);
    } finally {
      await s2.close();
    }
  });

  it('§3.7: outra família só enxerga a si mesma', async () => {
    const s = await TenantSession.openCustomer(T, RESP2);
    try {
      expect(await count(s, 'customers')).toBe(1); // só resp2
      expect(await count(s, 'bookings')).toBe(0);
    } finally {
      await s.close();
    }
  });

  it('§3.7: a equipe segue enxergando o tenant inteiro (a mudança não a quebra)', async () => {
    const s = await TenantSession.open(T);
    try {
      expect(await count(s, 'customers')).toBe(3);
      expect(await count(s, 'suppliers')).toBe(1);
      expect(await count(s, 'itineraries')).toBe(1);
    } finally {
      await s.close();
    }
  });
});
