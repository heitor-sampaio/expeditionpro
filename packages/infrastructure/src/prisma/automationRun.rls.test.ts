import { beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { resetSchema, testDatabaseUrl, TenantSession } from '../testkit/db.js';

/**
 * AU-06 · AU-10 · AU-12 — a execução e o log dela, isolados por tenant.
 *
 * O log é mais sensível que a automação: ele nomeia **decisões tomadas a respeito de pessoas
 * de verdade** — quem recebeu qual mensagem, por qual condição, em que dia. Vazar o desenho
 * já seria entregar a operação da empresa; vazar o log é entregar a operação com os clientes
 * dentro.
 *
 * Roda contra Postgres real porque o que está sendo provado é a policy, e a chave única que
 * segura a varredura temporal.
 */

const T = '11111111-1111-1111-1111-111111111111';
const T2 = 'aaaaaaaa-1111-1111-1111-111111111111';
const RESP = '22222222-2222-2222-2222-222222222222';
const AUTO = '33333333-3333-3333-3333-333333333333';
const AUTO2 = '44444444-4444-4444-4444-444444444444';
const RUN = '55555555-5555-5555-5555-555555555555';
const RUN2 = '66666666-6666-6666-6666-666666666666';

const SEED = `
  INSERT INTO tenants (id, name, slug) VALUES ('${T}', 'Drakkar', 'drk'), ('${T2}', 'Outra', 'outra');
  INSERT INTO customers (id, tenant_id, responsible_id, full_name, cpf, birth_date)
    VALUES ('${RESP}', '${T}', NULL, 'Resp Um', '11111111111', '1985-01-01');
  INSERT INTO automations (id, tenant_id, name, trigger_type)
    VALUES ('${AUTO}', '${T}', 'Follow-up de proposta', 'opportunity_moved'),
           ('${AUTO2}', '${T2}', 'Segredo da concorrente', 'message_received');
  INSERT INTO automation_runs (id, tenant_id, automation_id, status)
    VALUES ('${RUN}', '${T}', '${AUTO}', 'done'),
           ('${RUN2}', '${T2}', '${AUTO2}', 'done');
  INSERT INTO automation_run_steps (id, tenant_id, run_id, node_id, kind, outcome)
    VALUES (gen_random_uuid(), '${T}', '${RUN}', 'a1', 'action', 'fez'),
           (gen_random_uuid(), '${T2}', '${RUN2}', 'a1', 'action', 'fez');
`;

async function count(session: TenantSession, table: string): Promise<number> {
  const rows = await session.rows<{ n: string }>(`SELECT count(*)::int AS n FROM ${table}`);
  return Number(rows[0]?.n ?? -1);
}

describe('AU-10: execução e log são de um tenant só', () => {
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

  it('a equipe lê só as execuções do próprio tenant', async () => {
    const s = await TenantSession.open(T);
    try {
      expect(await count(s, 'automation_runs')).toBe(1);
    } finally {
      await s.close();
    }
  });

  it('a equipe lê só os passos do próprio tenant', async () => {
    const s = await TenantSession.open(T);
    try {
      expect(await count(s, 'automation_run_steps')).toBe(1);
    } finally {
      await s.close();
    }
  });

  /** O log diz quem recebeu o quê e por quê. É o último lugar que o cliente deveria alcançar. */
  it('o cliente não vê execução nem passo', async () => {
    const s = await TenantSession.openCustomer(T, RESP);
    try {
      expect(await count(s, 'automation_runs')).toBe(0);
      expect(await count(s, 'automation_run_steps')).toBe(0);
    } finally {
      await s.close();
    }
  });

  it('o cliente também não escreve no log', async () => {
    const s = await TenantSession.openCustomer(T, RESP);
    try {
      await expect(
        s.rows(
          `INSERT INTO automation_run_steps (id, tenant_id, run_id, node_id, kind, outcome)
           VALUES (gen_random_uuid(), '${T}', '${RUN}', 'x', 'action', 'inventado')`,
        ),
      ).rejects.toThrow();
    } finally {
      await s.close();
    }
  });

  /**
   * AU-12 — a regra que faz a varredura temporal ser segura. Sem esta unique, um reinício do
   * processo no meio da varredura mandaria a mesma mensagem duas vezes para o mesmo cliente.
   */
  it('a mesma chave de idempotência não entra duas vezes na mesma automação', async () => {
    const client = new Client({ connectionString: testDatabaseUrl() });
    await client.connect();
    try {
      const inserir = `INSERT INTO automation_runs (id, tenant_id, automation_id, idempotency_key)
                       VALUES (gen_random_uuid(), '${T}', '${AUTO}', 'evento-9:-3')`;
      await client.query(inserir);
      await expect(client.query(inserir)).rejects.toThrow();
    } finally {
      await client.end();
    }
  });

  /** Sem chave, a unique não estorva: gatilho de evento abre uma execução por acontecimento. */
  it('execuções sem chave de idempotência convivem', async () => {
    const client = new Client({ connectionString: testDatabaseUrl() });
    await client.connect();
    try {
      const inserir = `INSERT INTO automation_runs (id, tenant_id, automation_id)
                       VALUES (gen_random_uuid(), '${T}', '${AUTO}')`;
      await client.query(inserir);
      await expect(client.query(inserir)).resolves.toBeDefined();
    } finally {
      await client.end();
    }
  });

  /** Status fora da lista é grafo de estado inventado em produção. O banco recusa. */
  it('status desconhecido é recusado pelo banco', async () => {
    const client = new Client({ connectionString: testDatabaseUrl() });
    await client.connect();
    try {
      await expect(
        client.query(
          `INSERT INTO automation_runs (id, tenant_id, automation_id, status)
           VALUES (gen_random_uuid(), '${T}', '${AUTO}', 'quase_la')`,
        ),
      ).rejects.toThrow();
    } finally {
      await client.end();
    }
  });
});
