import { describe, expect, it } from 'vitest';
import { missingEnvWarning } from './missingEnvWarning.js';

/**
 * SEC-01 — o aviso de recurso degradado precisa nomear a variável que **de fato** faltou.
 *
 * Achado ao provar em produção que o servidor recusa subir sem autenticação: junto do erro
 * correto saiu `SUPABASE_SERVICE_ROLE_KEY ausente`, com a chave presente no ambiente. Quem
 * faltava era a `SUPABASE_URL` — o `buildAuthAdmin` exigia as duas e citava só uma.
 *
 * Aviso que aponta a variável errada é pior que aviso nenhum: manda a pessoa conferir,
 * regerar e recolar um segredo que nunca esteve errado, enquanto a causa segue intocada.
 */
describe('SEC-01: aviso de variável de ambiente ausente', () => {
  const consequencia = 'convite de equipe indisponível.';
  const nomes = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

  it('nada ausente: não avisa', () => {
    expect(
      missingEnvWarning(
        { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'chave' },
        nomes,
        consequencia,
      ),
    ).toBeUndefined();
  });

  it('uma ausente: nomeia só ela, no singular', () => {
    expect(missingEnvWarning({ SUPABASE_SERVICE_ROLE_KEY: 'chave' }, nomes, consequencia)).toBe(
      'SUPABASE_URL ausente — convite de equipe indisponível.',
    );
  });

  it('não menciona a variável que está presente — era exatamente esse o erro', () => {
    const aviso = missingEnvWarning({ SUPABASE_SERVICE_ROLE_KEY: 'chave' }, nomes, consequencia);
    expect(aviso).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('duas ausentes: nomeia as duas, no plural', () => {
    expect(missingEnvWarning({}, nomes, consequencia)).toBe(
      'SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY ausentes — convite de equipe indisponível.',
    );
  });

  it('três ausentes: vírgula até a última, e "e" antes dela', () => {
    expect(missingEnvWarning({}, ['A', 'B', 'C'], consequencia)).toBe(
      'A, B e C ausentes — convite de equipe indisponível.',
    );
  });

  it('string vazia conta como ausente — foi assim que a variável sumiu no Railway', () => {
    expect(
      missingEnvWarning(
        { SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: 'chave' },
        nomes,
        consequencia,
      ),
    ).toBe('SUPABASE_URL ausente — convite de equipe indisponível.');
  });
});
