import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export { PrismaClient };

/**
 * Cria o client base (com BYPASSRLS via role do Prisma, §2.2). Ninguém consulta o
 * banco por este client diretamente em código de request — usa-se `tenantClient`,
 * que injeta o tenant. O base existe para migrations, seed, criação de tenant e
 * para a própria extension delegar operações por id já validado.
 *
 * Prisma 7 usa driver adapters. `connectionString` permite os testes apontarem para
 * TEST_DATABASE_URL sem tocar no ambiente de produção; ausente, cai em DATABASE_URL.
 */
export function createPrismaClient(connectionString?: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: connectionString ?? process.env['DATABASE_URL'],
  });
  return new PrismaClient({ adapter });
}
