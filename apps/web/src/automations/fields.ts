import {
  CAMPOS_DO_GATILHO,
  contextFieldsFor,
  searchFieldsFor,
  TRIGGER_TYPES,
} from '@expedition/domain';
import type { ContextField, TriggerType } from '@expedition/domain';

/**
 * AU-16 — os campos que o seletor oferece.
 *
 * Sem isto, desenhar uma automação é lembrar de cor que existe `contato.nome` e que não existe
 * `contato.fone`. Errar não dá erro: a variável ausente vira vazio (AU-09, e é a regra certa),
 * a mensagem sai sem o nome do cliente e ninguém descobre.
 *
 * A lista vem de dois lugares. O que o gatilho põe no contexto é contrato, e mora no domínio
 * — a mesma lista que o teste da borda cobra. O que o fluxo define em bloco de variável só o
 * quadro conhece, e por isso é lido daqui, do desenho aberto na tela.
 */

/** O bloco como o quadro o guarda. Só o que interessa para achar campo. */
export interface BlocoNoQuadro {
  readonly type?: string | undefined;
  readonly data: { readonly type: string; readonly config: Record<string, unknown> };
}

/** O gatilho posto no quadro, ou `null` — inclusive quando o tipo não é um que se conhece. */
export function gatilhoDoQuadro(nodes: readonly BlocoNoQuadro[]): TriggerType | null {
  const gatilho = nodes.find((no) => no.type === 'trigger');
  if (gatilho === undefined) return null;
  const tipo = gatilho.data.type as TriggerType;
  return TRIGGER_TYPES.includes(tipo) ? tipo : null;
}

/**
 * As variáveis que o próprio fluxo define. O rótulo diz de onde vieram: numa lista com
 * `contato.nome` e `saudacao` lado a lado, saber qual é do gatilho e qual é do desenho é o que
 * evita procurar no lugar errado quando o valor vem vazio.
 */
export function variaveisDoFluxo(nodes: readonly BlocoNoQuadro[]): ContextField[] {
  const nomes = new Set<string>();
  for (const no of nodes) {
    if (no.data.type !== 'set') continue;
    const nome = String(no.data.config['name'] ?? '').trim();
    if (nome !== '') nomes.add(nome);
  }
  return [...nomes].map((nome) => ({ path: nome, label: 'Definida no fluxo' }));
}

/**
 * Tudo que se pode usar neste desenho: o contexto do gatilho, o que a busca traz, e o que o
 * fluxo criou pelo caminho.
 *
 * AU-18: a busca é a única fonte de contato num fluxo que começa no relógio — sem ela na
 * lista, o seletor ficaria vazio justamente onde é mais necessário.
 */
export function camposDisponiveis(nodes: readonly BlocoNoQuadro[]): ContextField[] {
  const daBusca = nodes
    .filter((no) => no.type === 'forEach')
    .flatMap((no) => searchFieldsFor(no.data.type));

  const todos = [
    ...contextFieldsFor(gatilhoDoQuadro(nodes)),
    ...daBusca,
    ...variaveisDoFluxo(nodes),
  ];
  const vistos = new Set<string>();
  return todos.filter((campo) => !vistos.has(campo.path) && vistos.add(campo.path) !== undefined);
}

/** Os campos de cada gatilho, para a biblioteca dizer o que ele traz antes de ser escolhido. */
export function camposDoGatilho(trigger: TriggerType): readonly ContextField[] {
  return CAMPOS_DO_GATILHO[trigger];
}
