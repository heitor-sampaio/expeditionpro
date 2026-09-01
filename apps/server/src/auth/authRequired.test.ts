import { describe, expect, it } from 'vitest';
import { authConfigFrom, MissingAuthConfigError } from './authRequired.js';

/**
 * SEC-01 — sem autenticação configurada, o servidor não sobe fora de desenvolvimento.
 *
 * O que existia antes: ausentes as três variáveis, `resolveContextForProd` emitia um
 * `console.warn` e devolvia um resolvedor que aceitava **qualquer requisição anônima** como
 * `team`/`owner`, com o tenant escolhido pelo header `x-tenant-slug` do próprio chamador —
 * e o default `'drk'` dispensava até o header. Isso vivia no ramo de produção, não num
 * bloco de dev, e o `.env.example` nem listava as variáveis: um deploy que seguisse o
 * exemplo caía exatamente ali, com banco real.
 *
 * Falha aberta é a pior forma de falhar: o sistema segue respondendo 200 e ninguém percebe.
 * O padrão certo já existia no mesmo arquivo — `unavailableCipher` recusa operar quando
 * falta a chave de cifra. Esta é a mesma disciplina aplicada à autenticação.
 */
describe('SEC-01: autenticação é obrigatória fora de desenvolvimento', () => {
  it('produção sem nenhuma variável de auth: recusa', () => {
    expect(() => authConfigFrom({}, 'production')).toThrow(MissingAuthConfigError);
  });

  it('a mensagem diz quais variáveis resolvem — erro que não ensina custa uma madrugada', () => {
    try {
      authConfigFrom({}, 'production');
      expect.unreachable('deveria ter lançado');
    } catch (error) {
      const texto = (error as Error).message;
      expect(texto).toContain('SUPABASE_URL');
      expect(texto).toContain('SUPABASE_JWKS_URL');
      expect(texto).toContain('SUPABASE_JWT_SECRET');
    }
  });

  it.each([
    [
      'SUPABASE_JWKS_URL',
      { SUPABASE_JWKS_URL: 'https://x.supabase.co/auth/v1/.well-known/jwks.json' },
    ],
    ['SUPABASE_JWT_SECRET', { SUPABASE_JWT_SECRET: 'segredo-legado' }],
    ['SUPABASE_URL', { SUPABASE_URL: 'https://x.supabase.co' }],
  ])('produção com %s configurada: aceita', (_nome, env) => {
    expect(() => authConfigFrom(env, 'production')).not.toThrow();
  });

  it('a precedência é JWKS explícita → segredo HS256 → JWKS derivada da URL', () => {
    expect(
      authConfigFrom(
        {
          SUPABASE_JWKS_URL: 'https://explicita/jwks.json',
          SUPABASE_JWT_SECRET: 'segredo',
          SUPABASE_URL: 'https://derivada.supabase.co',
        },
        'production',
      ),
    ).toEqual({ kind: 'jwks', url: 'https://explicita/jwks.json' });

    expect(
      authConfigFrom(
        { SUPABASE_JWT_SECRET: 'segredo', SUPABASE_URL: 'https://derivada.supabase.co' },
        'production',
      ),
    ).toEqual({ kind: 'secret', secret: 'segredo' });

    expect(authConfigFrom({ SUPABASE_URL: 'https://derivada.supabase.co' }, 'production')).toEqual({
      kind: 'jwks',
      url: 'https://derivada.supabase.co/auth/v1/.well-known/jwks.json',
    });
  });

  it('desenvolvimento sem auth: segue com o stub, e diz que está sem proteção', () => {
    /*
     * O stub existe por um motivo legítimo — tocar o backend local antes de plugar o Auth.
     * O erro nunca foi ele existir; foi ele valer em produção.
     */
    expect(authConfigFrom({}, 'development')).toEqual({ kind: 'insecure-dev-stub' });
  });

  it('teste também segue com o stub — a suíte de rota não tem Supabase', () => {
    expect(authConfigFrom({}, 'test')).toEqual({ kind: 'insecure-dev-stub' });
  });
});
