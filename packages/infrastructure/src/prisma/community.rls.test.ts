import { beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { resetSchema, testDatabaseUrl, TenantSession } from '../testkit/db.js';

/**
 * SEC-01 · §5.12 — teste de isolamento da comunidade. Comunidade fechada e por tenant:
 *   · o cliente lê só o feed **publicado** (posts/mídia/curtidas/comentários);
 *   · post **removido** e sua mídia somem para o cliente; a equipe vê tudo;
 *   · **denúncias** são só da equipe — o cliente lê zero;
 *   · nada cruza de um tenant para o outro.
 */

const TA = 'a0000000-0000-4000-8000-000000000011';
const TB = 'b0000000-0000-4000-8000-000000000012';
const AUTHOR = 'c0000000-0000-4000-8000-0000000000c1';
const READER = 'c0000000-0000-4000-8000-0000000000c2';
const CUSTB = 'c0000000-0000-4000-8000-0000000000d1';
const PUB = 'f0000000-0000-4000-8000-000000000001'; // publicado
const REM = 'f0000000-0000-4000-8000-000000000002'; // removido
const PB = 'f0000000-0000-4000-8000-00000000000b'; // post do tenant B

const SEED = `
  INSERT INTO tenants (id, name, slug) VALUES ('${TA}', 'Drakkar', 'drk'), ('${TB}', 'Outra', 'out');
  INSERT INTO customers (id, tenant_id, responsible_id, full_name, cpf, birth_date) VALUES
    ('${AUTHOR}', '${TA}', NULL, 'Autor', '11111111111', '1985-01-01'),
    ('${READER}', '${TA}', NULL, 'Leitor', '22222222222', '1986-02-02'),
    ('${CUSTB}', '${TB}', NULL, 'Cliente B', '33333333333', '1987-03-03');

  INSERT INTO posts (id, tenant_id, author_customer_id, body, status) VALUES
    ('${PUB}', '${TA}', '${AUTHOR}', 'publicado', 'published'),
    ('${REM}', '${TA}', '${AUTHOR}', 'removido', 'removed'),
    ('${PB}', '${TB}', '${CUSTB}', 'do tenant B', 'published');

  INSERT INTO post_media (id, post_id, storage_path, position) VALUES
    (gen_random_uuid(), '${PUB}', '${TA}/pub.webp', 0),
    (gen_random_uuid(), '${REM}', '${TA}/rem.webp', 0);

  INSERT INTO post_likes (tenant_id, post_id, liker_id) VALUES ('${TA}', '${PUB}', '${READER}');
  INSERT INTO post_comments (id, tenant_id, post_id, author_customer_id, body) VALUES
    (gen_random_uuid(), '${TA}', '${PUB}', '${READER}', 'top!');
  INSERT INTO post_reports (id, tenant_id, post_id, reporter_customer_id, reason) VALUES
    (gen_random_uuid(), '${TA}', '${PUB}', '${READER}', 'teste');
`;

async function count(session: TenantSession, table: string): Promise<number> {
  const rows = await session.rows<{ n: string }>(`SELECT count(*)::int AS n FROM ${table}`);
  return Number(rows[0]?.n ?? -1);
}

describe('SEC-01 · §5.12: isolamento da comunidade', () => {
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

  it('equipe do tenant A vê tudo do tenant (incl. removido) e nada de B', async () => {
    const s = await TenantSession.open(TA);
    try {
      expect(await count(s, 'posts')).toBe(2); // publicado + removido
      expect(await count(s, 'post_media')).toBe(2);
      expect(await count(s, 'post_likes')).toBe(1);
      expect(await count(s, 'post_comments')).toBe(1);
      expect(await count(s, 'post_reports')).toBe(1);
    } finally {
      await s.close();
    }
  });

  it('cliente lê só o feed publicado; removido e sua mídia somem', async () => {
    const s = await TenantSession.openCustomer(TA, READER);
    try {
      expect(await count(s, 'posts')).toBe(1); // só o publicado
      expect(await count(s, 'post_media')).toBe(1); // só a mídia do publicado
      expect(await count(s, 'post_comments')).toBe(1);
      expect(await count(s, 'post_likes')).toBe(1);
      const rem = await s.rows(`SELECT 1 FROM posts WHERE id = '${REM}'`);
      expect(rem).toHaveLength(0);
    } finally {
      await s.close();
    }
  });

  it('cliente NÃO lê denúncias (só equipe)', async () => {
    const s = await TenantSession.openCustomer(TA, READER);
    try {
      expect(await count(s, 'post_reports')).toBe(0);
    } finally {
      await s.close();
    }
  });

  it('cliente de outro tenant não lê o feed do tenant A', async () => {
    const s = await TenantSession.openCustomer(TB, CUSTB);
    try {
      const posts = await s.rows(`SELECT 1 FROM posts WHERE tenant_id = '${TA}'`);
      expect(posts).toHaveLength(0);
      const media = await s.rows(`SELECT 1 FROM post_media WHERE post_id = '${PUB}'`);
      expect(media).toHaveLength(0);
    } finally {
      await s.close();
    }
  });
});
