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
 * Configuração do Prisma 7. As URLs de conexão moram aqui, fora do schema.
 *
 *   DATABASE_URL — Supavisor em transaction mode para a aplicação
 *                  (?pgbouncer=true&connection_limit=1), §2.3
 *   DIRECT_URL   — conexão direta na porta 5432, usada pelas migrations
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
  },
  datasource: {
    url: env('DATABASE_URL'),
    directUrl: env('DIRECT_URL'),
  },
});
