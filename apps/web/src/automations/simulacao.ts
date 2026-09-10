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

import type { AutomationGraph } from '@expedition/domain';

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

/**
 * AU-25 — quem pode ensaiar.
 *
 * O caso de uso pede `requireTeam`, e isso **inclui o viewer**: o ensaio não executa ação
 * nenhuma e não grava nada, então quem pode ler o quadro pode percorrê-lo. A tela dizia "é de
 * owner ou admin", que é outra regra — e descobrir a permissão certa por um 403, depois de
 * preencher um formulário, é o pior jeito de aprender uma.
 */
export function podeEnsaiar(role: string | null): boolean {
  return role !== null && role !== 'customer';
}

/** O ensaio guardado, junto do desenho que o produziu. */
export interface EnsaioGuardado {
  readonly assinatura: string;
  readonly mapa: Map<string, PassoEnsaiado>;
}

/**
 * AU-27 — a identidade do desenho, para saber se um ensaio ainda responde por ele.
 *
 * **Sem posição.** Arrastar bloco não muda pergunta nenhuma, e invalidar ali faria o resultado
 * sumir toda vez que alguém arruma o quadro. O que conta é o que o motor percorreria: quais
 * blocos existem, o que cada um está configurado para fazer, e por onde se liga a quem.
 */
export function assinaturaDoGrafo(graph: AutomationGraph): string {
  return JSON.stringify({
    nodes: graph.nodes.map((no) => [no.id, no.kind, no.type, no.config]),
    edges: graph.edges.map((ligacao) => [ligacao.id, ligacao.from, ligacao.port, ligacao.to]),
  });
}

/**
 * AU-27 — o ensaio que a tela pode mostrar agora.
 *
 * Enquanto isto não existiu, mexer num campo e olhar o bloco entregava o resultado do desenho
 * **anterior**, sem nada dizendo que era velho. Não é ausência de resposta: é resposta errada
 * com cara de certa, e quem olha conclui sobre a mudança que acabou de fazer olhando o que
 * havia antes dela.
 *
 * Derivado, e não apagado por um efeito quando alguém digita — por isso mudar e desfazer
 * devolve o ensaio: o desenho voltou a ser o mesmo, então a resposta volta a valer.
 */
export function ensaioAtual(
  guardado: EnsaioGuardado | null,
  assinatura: string,
): Map<string, PassoEnsaiado> | null {
  if (guardado === null || guardado.assinatura !== assinatura) return null;
  return guardado.mapa;
}
