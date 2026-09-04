/**
 * AU-25 · AU-27 — o resultado do ensaio, do jeito que a tela usa.
 *
 * Fica separado do componente porque **duas** telas o consomem: o painel do ensaio, que mostra
 * o caminho inteiro, e cada bloco aberto, que mostra o que entrou e o que saiu dele. Ter o tipo
 * num lugar só é o que impede as duas leituras de divergirem.
 *
 * Sem `import` da borda HTTP de propósito: assim o módulo é testável sem subir cliente de
 * autenticação nenhum. Quem chama a rota é o painel do ensaio.
 */

export interface PassoEnsaiado {
  nodeId: string;
  kind: string;
  type: string;
  outcome: string;
  detail: Record<string, unknown>;
  /** O contexto que chegou neste bloco — o que o anterior entregou. */
  input: Record<string, unknown>;
  /** O que este bloco produziu. Numa ação, o que ela receberia: nada é executado. */
  output: Record<string, unknown>;
}

/**
 * Os passos indexados por bloco, que é como cada bloco pergunta pelo seu.
 *
 * Um bloco pode aparecer mais de uma vez num ensaio — um ciclo com espera passa duas vezes
 * pelo mesmo lugar. Fica a **primeira** passagem: é a que responde "com estes dados, o que
 * entra aqui?", e a segunda passagem já é consequência de tudo o que veio no meio.
 */
export function porBloco(passos: readonly PassoEnsaiado[]): Map<string, PassoEnsaiado> {
  const mapa = new Map<string, PassoEnsaiado>();
  for (const passo of passos) {
    if (!mapa.has(passo.nodeId)) mapa.set(passo.nodeId, passo);
  }
  return mapa;
}
