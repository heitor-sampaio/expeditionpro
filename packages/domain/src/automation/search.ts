import { evaluateCondition, type RunContext } from './interpreter.js';
import { renderTemplate } from './renderTemplate.js';
import type { ContextField } from './triggers.js';

/**
 * AU-18 — **sobre o que** uma automação pode iterar, e com que campos.
 *
 * O bloco de busca não é uma pergunta pronta ("conversas paradas"): é a lista das entidades que
 * o sistema já tem, com os campos de cada uma. Quem monta a pergunta é a equipe, combinando
 * campo, operador e valor — os mesmos do bloco "Se", de propósito.
 *
 * Este catálogo é o contrato: o que aparece no seletor da tela é o que a borda entrega no
 * contexto de cada execução semeada, e um teste cobra os dois lados. Entidade nova é uma
 * entrada aqui e um caso no registro de buscas; nada mais.
 */

export type SearchEntity = 'opportunities' | 'conversations';

export const SEARCH_ENTITIES = ['opportunities', 'conversations'] as const satisfies readonly [
  SearchEntity,
  ...SearchEntity[],
];

export interface EntityCatalog {
  readonly entity: SearchEntity;
  /** Como a tela chama isto, no vocabulário do glossário. */
  readonly label: string;
  /** O que cada item põe no contexto — e o que o filtro pode comparar. */
  readonly fields: readonly ContextField[];
}

const CONTATO: readonly ContextField[] = [
  { path: 'contato.nome', label: 'Nome do contato' },
  { path: 'contato.telefone', label: 'Telefone do contato' },
];

export const CATALOGO_DE_BUSCA: Record<SearchEntity, EntityCatalog> = {
  opportunities: {
    entity: 'opportunities',
    label: 'Oportunidades do funil',
    fields: [
      ...CONTATO,
      { path: 'oportunidade.id', label: 'Id da oportunidade' },
      { path: 'oportunidade.etapa', label: 'Etapa do funil' },
      { path: 'oportunidade.origem', label: 'Origem (whatsapp, site, manual…)' },
      { path: 'oportunidade.roteiro', label: 'Roteiro de interesse' },
      { path: 'oportunidade.paradaHaMin', label: 'Minutos desde a última mexida' },
      { path: 'oportunidade.criadaHaMin', label: 'Minutos desde que entrou no funil' },
      { path: 'oportunidade.fechada', label: 'Já virou inscrição (true ou false)' },
    ],
  },
  conversations: {
    entity: 'conversations',
    label: 'Conversas da caixa',
    fields: [
      ...CONTATO,
      { path: 'contato.ehCliente', label: 'Já é cliente (true ou false)' },
      { path: 'conversa.id', label: 'Id da conversa' },
      { path: 'conversa.canal', label: 'Canal (whatsapp, instagram…)' },
      { path: 'conversa.naoLidas', label: 'Mensagens não lidas' },
      { path: 'conversa.paradaHaMin', label: 'Minutos desde a última mensagem' },
      {
        path: 'conversa.quemDeve',
        label: 'Quem deve resposta (contato ou equipe)',
      },
      { path: 'oportunidade.id', label: 'Id da oportunidade ligada, se houver' },
      { path: 'oportunidade.etapa', label: 'Etapa do funil, se houver' },
    ],
  },
};

/** A entidade escolhida no bloco. Desconhecida devolve `null` — desenho de outra versão. */
export function searchEntityOf(config: Record<string, unknown>): SearchEntity | null {
  const bruto = String(config['entity'] ?? '');
  return SEARCH_ENTITIES.includes(bruto as SearchEntity) ? (bruto as SearchEntity) : null;
}

/** Os campos que a entidade escolhida põe no contexto. */
export function entityFieldsOf(config: Record<string, unknown>): readonly ContextField[] {
  const entidade = searchEntityOf(config);
  return entidade === null ? [] : CATALOGO_DE_BUSCA[entidade].fields;
}

/** Um filtro do bloco: a mesma pergunta do "Se", com id próprio para a tela remover a linha. */
export interface SearchFilter {
  readonly id: string;
  readonly field: string;
  readonly operator: string;
  readonly value: string;
}

/** Os filtros do bloco, lidos com desconfiança: vêm de `jsonb`. */
export function searchFilters(config: Record<string, unknown>): SearchFilter[] {
  const bruto = config['filters'];
  if (!Array.isArray(bruto)) return [];

  const filtros: SearchFilter[] = [];
  for (const item of bruto) {
    if (item === null || typeof item !== 'object') continue;
    const { id, field, operator, value } = item as Record<string, unknown>;
    if (typeof id !== 'string' || id === '') continue;
    filtros.push({
      id,
      field: typeof field === 'string' ? field : '',
      operator: typeof operator === 'string' ? operator : 'equals',
      value: typeof value === 'string' ? value : '',
    });
  }
  return filtros;
}

/**
 * O item passa pelos filtros do bloco?
 *
 * **E, nunca OU.** Um filtro que às vezes é "ou" é impossível de ler no quadro seis meses
 * depois; quem precisa de alternativa põe duas buscas em automações diferentes, ou desvia com
 * a escolha múltipla adiante. Sem filtro nenhum, tudo passa — é a lista inteira, e o quadro
 * mostra isso.
 *
 * **Dois contextos, e não um.** O campo (esquerda) se lê no **item** da lista; o valor
 * (direita) aceita variável e se lê no **contexto da execução**. É o que permite perguntar
 * "existe cartão com o telefone de quem acabou de escrever" — sem isso, o filtro só compara
 * com texto fixo, e uma automação que reage a uma mensagem não tem como procurar por ela.
 *
 * A comparação é a **mesma** do bloco "Se": filtrar aqui e perguntar ali têm que dar a mesma
 * resposta, senão a equipe filtra uma coisa e a condição seguinte discorda dela.
 */
export function matchesFilters(
  config: Record<string, unknown>,
  item: RunContext,
  daExecucao: RunContext = {},
): boolean {
  return searchFilters(config).every((filtro) =>
    filtro.field === ''
      ? true
      : evaluateCondition(
          {
            field: filtro.field,
            operator: filtro.operator,
            // AU-09: variável ausente vira vazio, nunca o marcador cru virando texto de busca.
            value: renderTemplate(filtro.value, daExecucao),
          },
          item,
        ),
  );
}
