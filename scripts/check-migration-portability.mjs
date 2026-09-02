#!/usr/bin/env node
/**
 * Migration que só funciona no Supabase quebra o CI inteiro.
 *
 * A suíte de integração e a de RLS reaplicam **todas** as migrations num `postgres:17` cru
 * (`resetSchema`). Nesse banco não existem os roles do Supabase (`authenticated`, `anon`,
 * `service_role`) nem os schemas `storage` e `auth`. Uma linha solta que os cite derruba a
 * reaplicação — e o sintoma não aponta para a migration nova: **todos** os 66 testes de
 * integração e RLS falham de uma vez, porque nenhum deles consegue montar o banco.
 *
 * Aconteceu exatamente assim em 2026-09-02: a migration das policies de Storage guardava o
 * bloco de policies e deixava um `GRANT ... TO authenticated` de fora. O CI acusou; eu não
 * olhei o CI e afirmei que estava verde.
 *
 * A regra: toda referência a role ou schema que só existe no Supabase precisa estar dentro
 * de um bloco `DO $$ ... END $$;`, onde a migration pode conferir a existência antes de
 * executar. O verificador não julga a condição — julga o lugar. Bloco `DO` sem checagem
 * nenhuma continua sendo problema seu, mas pelo menos é problema visível.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MIGRATIONS = path.join(ROOT, 'packages/infrastructure/prisma/migrations');

/** O que não existe num Postgres cru. */
const SUPABASE_ONLY =
  /\b(?:TO|FROM)\s+(authenticated|anon|service_role)\b|\bstorage\.[a-z_]+|\bauth\.[a-z_]+/i;

/** @type {string[]} */
const offenders = [];

/** @param {string} sql @returns {number[]} linhas (1-based) fora de um bloco DO */
function linhasForaDeBloco(sql) {
  const linhas = sql.split('\n');
  /** @type {number[]} */
  const fora = [];
  let dentro = false;
  linhas.forEach((linha, i) => {
    // Comentário não executa: as migrations deste repositório explicam *por que* não usam
    // `auth.jwt()`, e citar o nome numa explicação não pode acusar.
    const codigo = linha.replace(/--.*$/, '');
    // `DO $$` abre; `END $$;` (ou `$$;`) fecha. Nenhuma migration deste repositório usa
    // dollar-quoting aninhado, então o par simples basta.
    if (/\bDO\s+\$\$/i.test(codigo)) dentro = true;
    if (SUPABASE_ONLY.test(codigo) && !dentro) fora.push(i + 1);
    if (/\$\$\s*;/.test(codigo)) dentro = false;
  });
  return fora;
}

for (const dir of readdirSync(MIGRATIONS)) {
  const full = path.join(MIGRATIONS, dir, 'migration.sql');
  if (!statSync(path.join(MIGRATIONS, dir)).isDirectory()) continue;
  let sql;
  try {
    sql = readFileSync(full, 'utf8');
  } catch {
    continue;
  }
  for (const linha of linhasForaDeBloco(sql)) {
    offenders.push(`${dir}/migration.sql:${linha}`);
  }
}

if (offenders.length > 0) {
  console.error('check:migrations FALHOU — referência a Supabase fora de bloco condicional:');
  for (const spot of offenders) console.error(`  · ${spot}`);
  console.error(
    '\nO CI reaplica todas as migrations num Postgres cru, sem os roles `authenticated`/`anon`/\n' +
      '`service_role` e sem os schemas `storage`/`auth`. Uma linha dessas fora de um bloco\n' +
      '`DO $$ ... END $$;` que confira a existência derruba a montagem do banco, e aí **todos**\n' +
      'os testes de integração e RLS falham de uma vez, sem apontar para a migration culpada.',
  );
  process.exit(1);
}

console.log('check:migrations OK — nenhuma migration depende do Supabase para ser aplicada.');
