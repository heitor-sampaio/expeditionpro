import { beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { resetSchema, testDatabaseUrl, TenantSession } from '../testkit/db.js';

/**
 * SEC-01 — teste de isolamento das tabelas de auditoria, documentos e consentimento
 * (§3.2.1 · §5.13 · §5.9 · CO-10). Prova por sessão de papel contra Postgres real:
 *   · auditoria e denúncia são **só da equipe** — o cliente lê zero;
 *   · o Termo: o cliente lê só a versão **publicada** (nunca rascunho) e o próprio aceite;
 *   · consentimentos (comunicação e imagem): o cliente lê só os próprios;
 *   · nada cruza de um tenant para o outro.
 */

const TA = 'a0000000-0000-4000-8000-000000000001';
const TB = 'b0000000-0000-4000-8000-000000000002';
const RESP = 'c0000000-0000-4000-8000-0000000000a1';
const OTHER = 'c0000000-0000-4000-8000-0000000000a2';
const CUSTB = 'c0000000-0000-4000-8000-0000000000b1';
const DOCA = 'd0000000-0000-4000-8000-000000000001';
const V1 = 'e1000000-0000-4000-8000-000000000001'; // publicada
const V2 = 'e2000000-0000-4000-8000-000000000002'; // rascunho
const DOCB = 'd0000000-0000-4000-8000-000000000002';
const VB = 'eb000000-0000-4000-8000-000000000001';

const SEED = `
  INSERT INTO tenants (id, name, slug) VALUES ('${TA}', 'Drakkar', 'drk'), ('${TB}', 'Outra', 'out');
  INSERT INTO customers (id, tenant_id, responsible_id, full_name, cpf, birth_date) VALUES
    ('${RESP}', '${TA}', NULL, 'Resp Um', '11111111111', '1985-01-01'),
    ('${OTHER}', '${TA}', NULL, 'Outra Familia', '22222222222', '1986-02-02'),
    ('${CUSTB}', '${TB}', NULL, 'Cliente B', '33333333333', '1987-03-03');

  -- Termo do tenant A: v1 publicada + v2 rascunho; tenant B tem o seu.
  INSERT INTO legal_documents (id, tenant_id, kind, name) VALUES
    ('${DOCA}', '${TA}', 'term', 'Termo A'), ('${DOCB}', '${TB}', 'term', 'Termo B');
  INSERT INTO legal_document_versions (id, tenant_id, document_id, version_number, content_html, published_at) VALUES
    ('${V1}', '${TA}', '${DOCA}', 1, '<p>v1</p>', now()),
    ('${V2}', '${TA}', '${DOCA}', 2, '<p>v2</p>', NULL),
    ('${VB}', '${TB}', '${DOCB}', 1, '<p>b</p>', now());

  -- Aceites: RESP e OUTRA aceitaram a v1 (o cliente RESP só pode ver o próprio).
  INSERT INTO document_acceptances (id, tenant_id, document_version_id, customer_id, accepted_at, channel) VALUES
    (gen_random_uuid(), '${TA}', '${V1}', '${RESP}', now(), 'portal'),
    (gen_random_uuid(), '${TA}', '${V1}', '${OTHER}', now(), 'portal');

  -- Consentimentos de comunicação e de imagem (um por cliente).
  INSERT INTO communication_consents (id, tenant_id, customer_id, channel, granted_at, source) VALUES
    (gen_random_uuid(), '${TA}', '${RESP}', 'email', now(), 'portal'),
    (gen_random_uuid(), '${TA}', '${OTHER}', 'push', now(), 'portal');
  INSERT INTO media_consents (id, tenant_id, customer_id, scope, granted_at, source) VALUES
    (gen_random_uuid(), '${TA}', '${RESP}', 'community', now(), 'portal'),
    (gen_random_uuid(), '${TA}', '${OTHER}', 'community', now(), 'portal');

  -- Auditoria (só equipe).
  INSERT INTO audit_logs (id, tenant_id, actor_user_id, entity, entity_id, action) VALUES
    (gen_random_uuid(), '${TA}', NULL, 'customer', '${RESP}', 'family.move'),
    (gen_random_uuid(), '${TB}', NULL, 'customer', '${CUSTB}', 'family.move');
`;

async function count(session: TenantSession, sql: string): Promise<number> {
  const rows = await session.rows<{ n: string }>(`SELECT count(*)::int AS n FROM ${sql}`);
  return Number(rows[0]?.n ?? -1);
}

describe('SEC-01: isolamento — auditoria, documentos e consentimentos', () => {
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

  it('equipe do tenant A vê só o que é de A (isolamento entre tenants)', async () => {
    const s = await TenantSession.open(TA);
    try {
      expect(await count(s, 'legal_documents')).toBe(1);
      expect(await count(s, 'legal_document_versions')).toBe(2); // publicada + rascunho
      expect(await count(s, 'document_acceptances')).toBe(2);
      expect(await count(s, 'communication_consents')).toBe(2);
      expect(await count(s, 'media_consents')).toBe(2);
      expect(await count(s, 'audit_logs')).toBe(1); // só o de A
    } finally {
      await s.close();
    }
  });

  it('cliente lê o Termo publicado (não o rascunho) e SÓ o próprio aceite/consentimento', async () => {
    const s = await TenantSession.openCustomer(TA, RESP);
    try {
      expect(await count(s, 'legal_documents')).toBe(1); // o Termo ativo
      expect(await count(s, 'legal_document_versions')).toBe(1); // só a publicada
      expect(await count(s, 'document_acceptances')).toBe(1); // só o de RESP
      expect(await count(s, 'communication_consents')).toBe(1); // só o de RESP
      expect(await count(s, 'media_consents')).toBe(1); // só o de RESP
    } finally {
      await s.close();
    }
  });

  it('cliente NÃO lê auditoria (dado só de equipe)', async () => {
    const s = await TenantSession.openCustomer(TA, RESP);
    try {
      expect(await count(s, 'audit_logs')).toBe(0);
    } finally {
      await s.close();
    }
  });

  it('cliente de outro tenant não lê nada do tenant A', async () => {
    const s = await TenantSession.openCustomer(TB, CUSTB);
    try {
      const leaked = await s.rows(
        `SELECT 1 FROM legal_document_versions WHERE tenant_id = '${TA}'`,
      );
      expect(leaked).toHaveLength(0);
      const acc = await s.rows(`SELECT 1 FROM document_acceptances WHERE tenant_id = '${TA}'`);
      expect(acc).toHaveLength(0);
    } finally {
      await s.close();
    }
  });
});
