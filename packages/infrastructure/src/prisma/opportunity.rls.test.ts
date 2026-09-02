import { beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { resetSchema, testDatabaseUrl, TenantSession } from '../testkit/db.js';

/**
 * OP-11 — o funil é **só da equipe**, e nenhum tenant vê o do outro.
 *
 * O que está nesta tabela é a lista de quem a empresa está tentando vender, com nome,
 * telefone e valor previsto. Para um concorrente que fosse tenant da mesma plataforma, é
 * exatamente a informação que ele não pode ter — mais sensível, em termos comerciais, que
 * a lista de clientes já fechados.
 *
 * Para o cliente, a existência do funil não é assunto: ele não sabe que é um cartão numa
 * coluna chamada "Proposta enviada", e não deveria descobrir por uma consulta.
 *
 * Roda contra Postgres real porque é a **policy** que está sendo provada. Um teste em
 * repositório de memória verificaria a minha ideia da policy, não a policy.
 */

const T = '11111111-1111-1111-1111-111111111111';
const T2 = 'aaaaaaaa-1111-1111-1111-111111111111';
const RESP = '22222222-2222-2222-2222-222222222222';
const STAGE_A = '33333333-3333-3333-3333-333333333333';
const STAGE_B = '44444444-4444-4444-4444-444444444444';

const SEED = `
  INSERT INTO tenants (id, name, slug) VALUES ('${T}', 'Drakkar', 'drk'), ('${T2}', 'Outra', 'outra');
  INSERT INTO customers (id, tenant_id, responsible_id, full_name, cpf, birth_date)
    VALUES ('${RESP}', '${T}', NULL, 'Resp Um', '11111111111', '1985-01-01');
  INSERT INTO opportunity_stages (id, tenant_id, name, position, kind)
    VALUES ('${STAGE_A}', '${T}', 'Conversando', 0, 'open'),
           ('${STAGE_B}', '${T2}', 'Conversando', 0, 'open');
  INSERT INTO opportunities (id, tenant_id, stage_id, contact_name, phone, expected_value_cents, source)
    VALUES (gen_random_uuid(), '${T}', '${STAGE_A}', 'Ana Prado', '5548999998877', 200000, 'whatsapp'),
           (gen_random_uuid(), '${T2}', '${STAGE_B}', 'Cliente da concorrente', '5548999990000', 500000, 'manual');
`;

async function count(session: TenantSession, table: string): Promise<number> {
  const rows = await session.rows<{ n: string }>(`SELECT count(*)::int AS n FROM ${table}`);
  return Number(rows[0]?.n ?? -1);
}

describe('OP-11: o funil é da equipe, e de um tenant só', () => {
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

  it('a equipe lê só as etapas e os cartões do próprio tenant', async () => {
    const s = await TenantSession.open(T);
    try {
      expect(await count(s, 'opportunity_stages')).toBe(1);
      expect(await count(s, 'opportunities')).toBe(1);
    } finally {
      await s.close();
    }
  });

  it('o outro tenant não enxerga o funil daqui — é a lista de vendas em andamento', async () => {
    const s = await TenantSession.open(T2);
    try {
      expect(await count(s, 'opportunity_stages')).toBe(1); // a própria
      expect(await count(s, 'opportunities')).toBe(1); // a própria
      const nomes = await s.rows<{ contact_name: string }>(
        'SELECT contact_name FROM opportunities',
      );
      expect(nomes.map((r) => r.contact_name)).toEqual(['Cliente da concorrente']);
    } finally {
      await s.close();
    }
  });

  it('o cliente não vê funil nem etapa — não sabe que existe', async () => {
    const s = await TenantSession.openCustomer(T, RESP);
    try {
      expect(await count(s, 'opportunity_stages')).toBe(0);
      expect(await count(s, 'opportunities')).toBe(0);
    } finally {
      await s.close();
    }
  });

  it('o cliente também não escreve — a policy vale para gravação, não só leitura', async () => {
    const s = await TenantSession.openCustomer(T, RESP);
    try {
      await expect(
        s.rows(
          `INSERT INTO opportunities (id, tenant_id, stage_id, contact_name, source)
           VALUES (gen_random_uuid(), '${T}', '${STAGE_A}', 'Invadido', 'manual')`,
        ),
      ).rejects.toThrow();
    } finally {
      await s.close();
    }
  });

  it('a equipe não consegue gravar cartão no tenant do vizinho', async () => {
    const s = await TenantSession.open(T);
    try {
      await expect(
        s.rows(
          `INSERT INTO opportunities (id, tenant_id, stage_id, contact_name, source)
           VALUES (gen_random_uuid(), '${T2}', '${STAGE_B}', 'Enxerido', 'manual')`,
        ),
      ).rejects.toThrow();
    } finally {
      await s.close();
    }
  });

  it('OP-06: etapa não se apaga com cartão dentro — a FK é RESTRICT, não CASCADE', async () => {
    const client = new Client({ connectionString: testDatabaseUrl() });
    await client.connect();
    try {
      await expect(
        client.query(`DELETE FROM opportunity_stages WHERE id = '${STAGE_A}'`),
      ).rejects.toThrow();
    } finally {
      await client.end();
    }
  });
});
