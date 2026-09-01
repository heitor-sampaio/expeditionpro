/**
 * SEC-01 — o aviso de recurso degradado nomeia a variável que **de fato** faltou.
 *
 * Achado ao provar em produção que o servidor recusa subir sem autenticação: junto do erro
 * correto saiu `SUPABASE_SERVICE_ROLE_KEY ausente`, com a chave presente no ambiente — quem
 * faltava era a `SUPABASE_URL`. O aviso citava uma das duas variáveis exigidas, fixa no
 * texto, e por isso acertava só metade das vezes.
 *
 * Aviso que aponta a variável errada é pior que aviso nenhum: manda a pessoa conferir,
 * regerar e recolar um segredo que nunca esteve errado, enquanto a causa segue intocada.
 */
export function missingEnvWarning(
  env: Record<string, string | undefined>,
  names: readonly string[],
  consequence: string,
): string | undefined {
  // String vazia conta como ausente: é assim que uma variável some numa plataforma.
  const missing = names.filter((name) => !env[name]);
  if (missing.length === 0) return undefined;

  const flexao = missing.length === 1 ? 'ausente' : 'ausentes';
  return `${listar(missing)} ${flexao} — ${consequence}`;
}

/** "A" · "A e B" · "A, B e C" */
function listar(names: readonly string[]): string {
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} e ${names.at(-1)!}`;
}
