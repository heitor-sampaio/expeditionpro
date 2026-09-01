/**
 * Baseline do Prisma para um banco cujo schema foi aplicado FORA do fluxo `migrate deploy`
 * (ex.: via MCP `apply_migration` durante o desenvolvimento). Registra em
 * `_prisma_migrations` as migrations que já estão no banco mas não foram gravadas ali,
 * para que um `prisma migrate deploy` futuro não tente recriá-las.
 *
 * O `checksum` do Prisma é o **sha256 do arquivo `migration.sql`** — computamos o mesmo,
 * então isto é equivalente a `prisma migrate resolve --applied <name>` para cada uma, mas
 * sem exigir o engine do Prisma (só a `DATABASE_URL`).
 *
 * Uso:  DATABASE_URL=postgres://... node scripts/baseline.mjs [--dry-run]
 *
 * Idempotente: migrations já registradas são puladas. NÃO aplica DDL — assume que o
 * schema já existe (é justamente o caso que este script conserta).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(HERE, '../prisma/migrations');
const DRY_RUN = process.argv.includes('--dry-run');

function migrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((d) => statSync(path.join(MIGRATIONS_DIR, d)).isDirectory())
    .filter((d) => existsSync(path.join(MIGRATIONS_DIR, d, 'migration.sql')))
    .sort();
}

function checksumOf(name) {
  const file = path.join(MIGRATIONS_DIR, name, 'migration.sql');
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL ausente — aponte para o banco a baselinar.');

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const applied = new Set(
      (await client.query('SELECT migration_name FROM _prisma_migrations')).rows.map(
        (r) => r.migration_name,
      ),
    );
    const missing = migrations().filter((m) => !applied.has(m));
    if (missing.length === 0) {
      console.log('Nada a fazer: todas as migrations já estão registradas.');
      return;
    }
    console.log(`${missing.length} migration(s) a registrar como aplicada(s):`);
    for (const name of missing) {
      console.log(`  ${DRY_RUN ? '[dry-run] ' : ''}${name}`);
      if (DRY_RUN) continue;
      await client.query(
        `INSERT INTO _prisma_migrations
           (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
         VALUES ($1, $2, $3, now(), now(), 1)
         ON CONFLICT DO NOTHING`,
        [randomUUID(), checksumOf(name), name],
      );
    }
    console.log(
      DRY_RUN ? 'Dry-run: nada gravado.' : 'Pronto. `prisma migrate deploy` agora é no-op.',
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Falha no baseline:', error.message);
  process.exitCode = 1;
});
