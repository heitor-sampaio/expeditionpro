import { beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { resetSchema, testDatabaseUrl, TenantSession } from '../testkit/db.js';

/**
 * AT-11 — o atendimento é **só da equipe**, e nenhum tenant vê a conversa do outro.
 *
 * O que está em `messages` é o que os clientes escreveram: preço combinado, dado pessoal
 * solto no meio da conversa, reclamação. É o conteúdo mais sensível que o sistema guarda —
 * mais que a ficha, porque a ficha tem campos e a conversa tem qualquer coisa.
 *
 * E `channel_integrations` guarda a chave de API do provedor: quem a tiver manda mensagem
 * **como a empresa**, para qualquer número. É o equivalente ao token do gateway (PG-01).
 *
 * Roda contra Postgres real porque é a policy que está sendo provada.
 */

const T = '11111111-1111-1111-1111-111111111111';
const T2 = 'aaaaaaaa-1111-1111-1111-111111111111';
const RESP = '22222222-2222-2222-2222-222222222222';
const CONV = '33333333-3333-3333-3333-333333333333';
const CONV2 = '44444444-4444-4444-4444-444444444444';

const SEED = `
  INSERT INTO tenants (id, name, slug) VALUES ('${T}', 'Drakkar', 'drk'), ('${T2}', 'Outra', 'outra');
  INSERT INTO customers (id, tenant_id, responsible_id, full_name, cpf, birth_date)
    VALUES ('${RESP}', '${T}', NULL, 'Resp Um', '11111111111', '1985-01-01');
  INSERT INTO channel_integrations (id, tenant_id, channel, provider, base_url, external_account_id, access_token, webhook_token_hash)
    VALUES (gen_random_uuid(), '${T}', 'whatsapp', 'evolution', 'https://evo-a', 'drk', 'cifrado-a', 'hash-a'),
           (gen_random_uuid(), '${T2}', 'whatsapp', 'evolution', 'https://evo-b', 'outra', 'cifrado-b', 'hash-b');
  INSERT INTO conversations (id, tenant_id, channel, channel_user_id, display_name, last_message_at)
    VALUES ('${CONV}', '${T}', 'whatsapp', '5548999998877', 'Ana Prado', now()),
           ('${CONV2}', '${T2}', 'whatsapp', '5511999990000', 'Cliente da concorrente', now());
  INSERT INTO messages (id, tenant_id, conversation_id, external_id, direction, body, sent_at)
    VALUES (gen_random_uuid(), '${T}', '${CONV}', 'MSG-A', 'in', 'Quanto custa a Coxilha Rica?', now()),
           (gen_random_uuid(), '${T2}', '${CONV2}', 'MSG-B', 'in', 'segredo da concorrente', now());
`;

async function count(session: TenantSession, table: string): Promise<number> {
  const rows = await session.rows<{ n: string }>(`SELECT count(*)::int AS n FROM ${table}`);
  return Number(rows[0]?.n ?? -1);
}

describe('AT-11: conversas são da equipe, e de um tenant só', () => {
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

  it('a equipe lê só o canal, as conversas e as mensagens do próprio tenant', async () => {
    const s = await TenantSession.open(T);
    try {
      expect(await count(s, 'channel_integrations')).toBe(1);
      expect(await count(s, 'conversations')).toBe(1);
      expect(await count(s, 'messages')).toBe(1);
    } finally {
      await s.close();
    }
  });

  it('o outro tenant não lê a conversa daqui — é o conteúdo mais sensível do sistema', async () => {
    const s = await TenantSession.open(T2);
    try {
      const corpos = await s.rows<{ body: string }>('SELECT body FROM messages');
      expect(corpos.map((r) => r.body)).toEqual(['segredo da concorrente']);
    } finally {
      await s.close();
    }
  });

  it('o cliente não vê conversa, mensagem nem canal — o portal não tem chat (AT-11)', async () => {
    const s = await TenantSession.openCustomer(T, RESP);
    try {
      expect(await count(s, 'channel_integrations')).toBe(0);
      expect(await count(s, 'conversations')).toBe(0);
      expect(await count(s, 'messages')).toBe(0);
    } finally {
      await s.close();
    }
  });

  it('o cliente também não escreve mensagem', async () => {
    const s = await TenantSession.openCustomer(T, RESP);
    try {
      await expect(
        s.rows(
          `INSERT INTO messages (id, tenant_id, conversation_id, external_id, direction, body, sent_at)
           VALUES (gen_random_uuid(), '${T}', '${CONV}', 'INVADIDA', 'in', 'oi', now())`,
        ),
      ).rejects.toThrow();
    } finally {
      await s.close();
    }
  });

  it('AT-03: o mesmo id de mensagem não entra duas vezes no tenant', async () => {
    const client = new Client({ connectionString: testDatabaseUrl() });
    await client.connect();
    try {
      await expect(
        client.query(
          `INSERT INTO messages (id, tenant_id, conversation_id, external_id, direction, body, sent_at)
           VALUES (gen_random_uuid(), '${T}', '${CONV}', 'MSG-A', 'in', 'reenvio', now())`,
        ),
      ).rejects.toThrow();
    } finally {
      await client.end();
    }
  });

  it('uma conexão por canal — reconectar atualiza, não empilha', async () => {
    const client = new Client({ connectionString: testDatabaseUrl() });
    await client.connect();
    try {
      await expect(
        client.query(
          `INSERT INTO channel_integrations (id, tenant_id, channel, provider, base_url, external_account_id, access_token, webhook_token_hash)
           VALUES (gen_random_uuid(), '${T}', 'whatsapp', 'evolution', 'https://outro', 'drk2', 'x', 'y')`,
        ),
      ).rejects.toThrow();
    } finally {
      await client.end();
    }
  });
});
