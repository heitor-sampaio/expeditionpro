#!/usr/bin/env node
/**
 * SEC-01: migration que cria tabela sem RLS falha no CI.
 *
 * Varre as migrations, junta toda tabela criada e toda tabela com RLS habilitada.
 * Tabela criada sem `ENABLE ROW LEVEL SECURITY` em nenhuma migration é violação.
 * É a trava que impede o vazamento entre tenants de entrar por descuido.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = path.join(ROOT, 'packages', 'infrastructure', 'prisma', 'migrations');

/** Tabelas internas do Prisma não são de negócio. */
const IGNORED = new Set(['_prisma_migrations']);

function collectSql(dir) {
  let sql = '';
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      sql += collectSql(full);
    } else if (entry.endsWith('.sql')) {
      sql += '\n' + readFileSync(full, 'utf8');
    }
  }
  return sql;
}

function namesMatching(sql, regex) {
  const found = new Set();
  for (const match of sql.matchAll(regex)) {
    if (match[1] && !IGNORED.has(match[1])) found.add(match[1]);
  }
  return found;
}

let migrationsSql = '';
try {
  migrationsSql = collectSql(MIGRATIONS_DIR);
} catch {
  console.log('check:rls — nenhuma migration ainda; nada a verificar.');
  process.exit(0);
}

const created = namesMatching(migrationsSql, /CREATE TABLE (?:IF NOT EXISTS )?"([^"]+)"/g);
const rlsEnabled = namesMatching(
  migrationsSql,
  /ALTER TABLE "([^"]+)"\s+ENABLE ROW LEVEL SECURITY/gi,
);

const missing = [...created].filter((table) => !rlsEnabled.has(table));

if (missing.length > 0) {
  console.error('check:rls FALHOU — tabelas criadas sem RLS (SEC-01):');
  for (const table of missing) console.error(`  · ${table}`);
  console.error(
    '\nAdicione `ALTER TABLE "<tabela>" ENABLE ROW LEVEL SECURITY;` + policy na migration.',
  );
  process.exit(1);
}

console.log(`check:rls OK — ${created.size} tabela(s), todas com RLS habilitada.`);
