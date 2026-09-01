import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

/**
 * Testkit de banco. Nunca mocka Prisma (§10.3) — sobe Postgres real e aplica a
 * migration de verdade, com RLS, triggers e constraints. É o que sustenta a prova
 * de isolamento por tenant, o critério de pronto da Fase 0.
 *
 * Duas vias de acesso, deliberadamente:
 *   · role `app_user` (sem BYPASSRLS)  → exercita a camada RLS
 *   · client base do Prisma (superuser, bypassa RLS) → exercita a Client Extension,
 *     que é exatamente o cenário de produção do Prisma (§2.2)
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(HERE, '../../prisma/migrations');

/** Todas as migrations, em ordem cronológica (o nome começa pelo timestamp). */
function migrationSqlFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((entry) => statSync(path.join(MIGRATIONS_DIR, entry)).isDirectory())
    .sort()
    .map((dir) => path.join(MIGRATIONS_DIR, dir, 'migration.sql'))
    .filter((file) => existsSync(file));
}

export function testDatabaseUrl(): string {
  const url = process.env['TEST_DATABASE_URL'];
  if (!url) {
    throw new Error('TEST_DATABASE_URL ausente — testes de integração/RLS exigem Postgres real.');
  }
  return url;
}

const GRANT_APP_USER = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
      CREATE ROLE app_user NOLOGIN;
    END IF;
  END $$;
  GRANT USAGE ON SCHEMA public TO app_user;
  GRANT USAGE ON SCHEMA app TO app_user;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO app_user;
`;

/**
 * Zera o schema e reaplica **todas** as migrations em ordem. Aplicar só a init
 * deixaria de fora as tabelas e policies das fases seguintes — inclusive as policies
 * de audiência do cliente. Cada arquivo de teste começa do schema real e completo.
 */
export async function resetSchema(): Promise<void> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('DROP SCHEMA IF EXISTS app CASCADE');
    await client.query('CREATE SCHEMA public');
    // pg envia cada arquivo numa query só (simple protocol), então os corpos
    // dollar-quoted das funções plpgsql passam intactos.
    for (const file of migrationSqlFiles()) {
      await client.query(readFileSync(file, 'utf8'));
    }
    await client.query(GRANT_APP_USER);
  } finally {
    await client.end();
  }
}

/**
 * Sessão de banco no papel de um tenant, via role sem BYPASSRLS. Popula
 * request.jwt.claims como o Supabase faz, para as policies lerem o tenant do JWT.
 */
export class TenantSession {
  private constructor(private readonly client: Client) {}

  private static async openWithClaims(claims: object): Promise<TenantSession> {
    const client = new Client({ connectionString: testDatabaseUrl() });
    await client.connect();
    await client.query('SET ROLE app_user');
    await client.query('SELECT set_config($1, $2, false)', [
      'request.jwt.claims',
      JSON.stringify(claims),
    ]);
    return new TenantSession(client);
  }

  /** Sessão de equipe: tenant no JWT, sem role — passa a `tenant_isolation`. */
  static open(tenantId: string): Promise<TenantSession> {
    return TenantSession.openWithClaims({ app_metadata: { tenant_id: tenantId } });
  }

  /** Sessão de cliente (§3.7): `role: customer` + `customer_id` — só a própria família. */
  static openCustomer(tenantId: string, customerId: string): Promise<TenantSession> {
    return TenantSession.openWithClaims({
      app_metadata: { role: 'customer', tenant_id: tenantId, customer_id: customerId },
    });
  }

  async rows<T>(text: string, params: readonly unknown[] = []): Promise<T[]> {
    const result = await this.client.query(text, params as unknown[]);
    return result.rows as T[];
  }

  async close(): Promise<void> {
    await this.client.end();
  }
}
