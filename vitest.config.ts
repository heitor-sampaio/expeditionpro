import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Testes resolvem os pacotes do workspace direto do source, não do dist. Assim o
// ciclo TDD não exige rebuildar um pacote a cada mudança para o outro enxergar.
const root = import.meta.dirname;
const workspaceAliases = {
  '@expedition/domain': path.resolve(root, 'packages/domain/src/index.ts'),
  '@expedition/application': path.resolve(root, 'packages/application/src/index.ts'),
  '@expedition/infrastructure': path.resolve(root, 'packages/infrastructure/src/index.ts'),
};

/**
 * Três projetos, a pirâmide de testes do §10.3 do PRD:
 *
 *   unit         → domínio puro (preço, faixa etária, cashback, saldo, parsers).
 *                  Sem banco. Roda em milissegundos. É a maioria.
 *   integration  → repositórios contra Postgres REAL (nunca mock de Prisma).
 *                  Constraints, transações, triggers.
 *   rls          → isolamento entre tenants e entre audiências. Uma sessão por papel.
 *
 * Convenção de nome de arquivo decide o projeto:
 *   foo.test.ts              → unit
 *   foo.integration.test.ts  → integration
 *   foo.rls.test.ts          → rls
 */
export default defineConfig({
  resolve: { alias: workspaceAliases },
  test: {
    projects: [
      {
        resolve: { alias: workspaceAliases },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
          exclude: ['**/*.integration.test.ts', '**/*.rls.test.ts', '**/node_modules/**'],
        },
      },
      {
        resolve: { alias: workspaceAliases },
        test: {
          name: 'integration',
          environment: 'node',
          include: ['packages/**/*.integration.test.ts', 'apps/**/*.integration.test.ts'],
          setupFiles: ['./vitest.setup.db.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
        },
      },
      {
        resolve: { alias: workspaceAliases },
        test: {
          name: 'rls',
          environment: 'node',
          include: ['packages/**/*.rls.test.ts', 'apps/**/*.rls.test.ts'],
          setupFiles: ['./vitest.setup.db.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // 100% no núcleo de cálculo (§10.3). No resto, cobertura não é meta.
      include: ['packages/domain/src/**/*.ts'],
      exclude: ['**/index.ts', '**/*.test.ts'],
      thresholds: {
        // 100% no núcleo de cálculo. cashback/ledger entram quando os módulos existirem.
        'packages/domain/src/pricing/**': { lines: 100, functions: 100, branches: 100 },
      },
    },
  },
});
