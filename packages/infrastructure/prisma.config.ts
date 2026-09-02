import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 não carrega .env automaticamente. Node 24 tem carregador nativo.
// Em CI as variáveis vêm do ambiente, então a ausência do arquivo é esperada.
try {
  process.loadEnvFile();
} catch {
  // sem .env local — segue com o ambiente
}

/**
 * Configuração do Prisma 7 — lida pela **CLI** (`migrate`, `db push`, `introspect`,
 * `generate`), nunca pelo client em execução: `createPrismaClient` lê `DATABASE_URL` por
 * conta própria, através do driver adapter.
 *
 * Por isso a URL daqui é a **direta** (`DIRECT_URL`, porta 5432), não a do pooler:
 *
 *   DATABASE_URL — Supavisor em transaction mode, para a aplicação
 *                  (`?pgbouncer=true&connection_limit=1`), §2.3
 *   DIRECT_URL   — conexão direta, para migration
 *
 * Migration em transaction mode não sustenta o advisory lock que o Prisma usa para
 * serializar a aplicação — é o tipo de coisa que funciona nos primeiros testes e falha
 * quando duas migrations correm juntas.
 *
 * **Isto era um `directUrl:` ao lado do `url:` até 2026-09-02, e não tinha efeito nenhum.**
 * O `Datasource` do Prisma 7 aceita apenas `url` e `shadowDatabaseUrl`; `directUrl` foi
 * conceito do Prisma 5/6, declarado no schema. O campo a mais era descartado em silêncio e
 * a migration ia pelo pooler — este arquivo nunca passou por verificação de tipo, porque
 * não vive em nenhum `src/`. Agora vive no `tsconfig.tools.json`.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
  },
  datasource: {
    url: env('DIRECT_URL'),
  },
});
