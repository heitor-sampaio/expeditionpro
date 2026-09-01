/**
 * Setup dos projetos `integration` e `rls`: exige Postgres REAL.
 *
 * O PRD é categórico (§10.3): nunca mockar o banco. Metade das regras vive em
 * constraint, trigger e RLS — mock de Prisma passa verde enquanto o SQL falha.
 *
 * Espera TEST_DATABASE_URL apontando para um Postgres descartável (Supabase local
 * ou Testcontainers). Sem ele, falha alto em vez de silenciosamente pular — teste
 * de isolamento que não roda é pior que teste que não existe, porque dá falsa
 * sensação de cobertura.
 */
import { beforeAll } from 'vitest';

beforeAll(() => {
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error(
      'TEST_DATABASE_URL ausente. Os testes de integração e RLS exigem Postgres real ' +
        '(nunca mock — §10.3). Suba o stack local (`supabase start`) ou aponte para um ' +
        'Postgres descartável e exporte TEST_DATABASE_URL. Veja docs/testing.md.',
    );
  }
});
