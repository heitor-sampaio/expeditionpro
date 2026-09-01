import { beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { resetSchema, testDatabaseUrl, TenantSession } from '../testkit/db.js';

/**
 * §5.8 / PC-05 — o cliente acompanha **o próprio pedido de inscrição** ao vivo: enquanto
 * ele está na fila, o portal mostra "em análise"; quando a equipe aprova ou descarta, o
 * aviso some sozinho. Para isso o Realtime precisa que a linha de `intake_events` seja
 * legível pelo cliente — o Realtime respeita a RLS, então sem policy o evento nunca chega.
 *
 * O que ele lê é só o pedido **da própria família e feito pelo app**. Payload cru de
 * formulário do site é dado operacional da equipe (§8) e continua invisível.
 */

const T = '11111111-1111-1111-1111-111111111111';
const T2 = 'aaaaaaaa-1111-1111-1111-111111111111';
const RESP1 = '22222222-2222-2222-2222-222222222222';
const COMP1 = '33333333-3333-3333-3333-333333333333';
const RESP2 = '44444444-4444-4444-4444-444444444444';
const ITIN = '55555555-5555-5555-5555-555555555555';
const EVENT = '66666666-6666-6666-6666-666666666666';
const GRP = '77777777-7777-7777-7777-777777777777';

const MEU = 'aaaaaaaa-0000-0000-0000-000000000001';
const DA_OUTRA_FAMILIA = 'aaaaaaaa-0000-0000-0000-000000000002';
const DO_SITE = 'aaaaaaaa-0000-0000-0000-000000000003';
const DE_OUTRO_TENANT = 'aaaaaaaa-0000-0000-0000-000000000004';

const SEED = `
  INSERT INTO tenants (id, name, slug) VALUES ('${T}', 'Drakkar', 'drk'), ('${T2}', 'Outra', 'outra');
  INSERT INTO customers (id, tenant_id, responsible_id, full_name, cpf, birth_date) VALUES
    ('${RESP1}', '${T}', NULL, 'Resp Um', '11111111111', '1985-01-01'),
    ('${COMP1}', '${T}', '${RESP1}', 'Comp Um', '22222222222', '1987-02-02'),
    ('${RESP2}', '${T}', NULL, 'Resp Dois', '33333333333', '1990-03-03');
  INSERT INTO itineraries (id, tenant_id, name, slug) VALUES ('${ITIN}', '${T}', 'Coxilha Rica', 'coxilha-rica');
  INSERT INTO schedule_events (id, tenant_id, itinerary_id, start_date, end_date, status)
    VALUES ('${EVENT}', '${T}', '${ITIN}', '2026-06-01', '2026-06-05', 'scheduled');
  INSERT INTO groups (id, tenant_id, schedule_event_id, itinerary_id, name, status, visibility, pricing_mode)
    VALUES ('${GRP}', '${T}', '${EVENT}', '${ITIN}', 'Saída RLS', 'open', 'public', 'itinerary');
  INSERT INTO intake_events (id, tenant_id, source, payload, status) VALUES
    ('${MEU}', '${T}', 'portal',
      '{"kind":"portal_enrollment","groupId":"${GRP}","headCustomerId":"${RESP1}","participantCustomerIds":["${RESP1}"]}',
      'needs_allocation'),
    ('${DA_OUTRA_FAMILIA}', '${T}', 'portal',
      '{"kind":"portal_enrollment","groupId":"${GRP}","headCustomerId":"${RESP2}","participantCustomerIds":["${RESP2}"]}',
      'needs_allocation'),
    ('${DO_SITE}', '${T}', 'wp_flat_v1', '{"nome":"Fulano","cpf":"99999999999"}', 'needs_allocation'),
    ('${DE_OUTRO_TENANT}', '${T2}', 'portal',
      '{"kind":"portal_enrollment","groupId":"${GRP}","headCustomerId":"${RESP1}","participantCustomerIds":["${RESP1}"]}',
      'needs_allocation');
`;

async function ids(session: TenantSession): Promise<string[]> {
  const rows = await session.rows<{ id: string }>('SELECT id FROM intake_events ORDER BY id');
  return rows.map((row) => row.id);
}

describe('§5.8: o cliente lê o próprio pedido de inscrição (e só ele)', () => {
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

  it('§5.8: o responsável lê o pedido que fez pelo app', async () => {
    const s = await TenantSession.openCustomer(T, RESP1);
    try {
      expect(await ids(s)).toEqual([MEU]);
    } finally {
      await s.close();
    }
  });

  it('§5.8: o acompanhante enxerga o pedido da família — é a mesma inscrição', async () => {
    const s = await TenantSession.openCustomer(T, COMP1);
    try {
      expect(await ids(s)).toEqual([MEU]);
    } finally {
      await s.close();
    }
  });

  it('PC-05: não lê pedido de outra família, do formulário do site nem de outro tenant', async () => {
    const s = await TenantSession.openCustomer(T, RESP2);
    try {
      expect(await ids(s)).toEqual([DA_OUTRA_FAMILIA]);
    } finally {
      await s.close();
    }
  });

  it('§5.8: a equipe continua lendo a fila inteira do próprio tenant', async () => {
    const s = await TenantSession.open(T);
    try {
      expect(await ids(s)).toEqual([MEU, DA_OUTRA_FAMILIA, DO_SITE]);
    } finally {
      await s.close();
    }
  });

  it('§5.8: o cliente não escreve na fila — quem pede é o servidor', async () => {
    /*
     * A RLS **não levanta erro** num UPDATE: a `USING` da policy filtra as linhas
     * candidatas, então a escrita não alcança nenhuma e o comando volta vazio. Erro só
     * aparece quando uma `WITH CHECK` recusa a linha que está sendo gravada.
     *
     * Por isso a prova é dupla: zero linhas afetadas E o registro intacto para a equipe.
     * Asserção que só espera exceção passaria a falsa sensação de que a tabela é
     * inalcançável quando na verdade nem o mecanismo certo está sendo exercitado.
     */
    const s = await TenantSession.openCustomer(T, RESP1);
    try {
      const afetadas = await s.rows(
        `UPDATE intake_events SET status = 'allocated' WHERE id = '${MEU}' RETURNING id`,
      );
      expect(afetadas).toEqual([]);
    } finally {
      await s.close();
    }

    const equipe = await TenantSession.open(T);
    try {
      const [linha] = await equipe.rows<{ status: string }>(
        `SELECT status FROM intake_events WHERE id = '${MEU}'`,
      );
      expect(linha?.status).toBe('needs_allocation');
    } finally {
      await equipe.close();
    }
  });
});
