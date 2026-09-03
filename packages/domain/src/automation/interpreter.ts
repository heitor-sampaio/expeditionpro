/**
 * AU-01 · AU-07 — as decisões que o motor toma, sem ser o motor.
 *
 * Dado o contexto de uma execução e a configuração de um bloco, estas funções dizem qual é a
 * saída. Nada aqui lê banco, chama provedor ou olha o relógio do sistema: a data entra como
 * parâmetro. É o que permite provar "mensagem contendo preço vai pelo sim" sem subir Postgres.
 */

import type { Port } from './graph.js';

/** O piso da espera, em minutos. A varredura de rede é dessa ordem; menos que isso mentiria. */
export const ESPERA_MINIMA_MIN = 1;

/**
 * O contexto de uma execução: o que o gatilho trouxe, mais as variáveis que o fluxo definiu.
 * É `unknown` por dentro de propósito — vem de `jsonb`, e desconfiar dele é o certo.
 */
export type RunContext = Record<string, unknown>;

/**
 * Lê `contato.nome` de dentro do contexto e devolve **sempre texto**. Campo ausente vira
 * vazio, e não `undefined`: a comparação seguinte não deveria precisar saber a diferença, e
 * um marcador cru nunca chega na cara do cliente (AU-09).
 */
export function readPath(contexto: RunContext, caminho: string): string {
  if (caminho.trim() === '') return '';

  let atual: unknown = contexto;
  for (const parte of caminho.split('.')) {
    if (atual === null || typeof atual !== 'object') return '';
    atual = (atual as Record<string, unknown>)[parte];
  }

  if (atual === null || atual === undefined) return '';
  if (typeof atual === 'object') return '';
  return String(atual);
}

/**
 * A comparação de uma condição. Operador desconhecido devolve **não** em vez de explodir: um
 * bloco salvo por uma versão mais nova do editor desvia pelo lado seguro, e a execução segue.
 */
export function evaluateCondition(config: Record<string, unknown>, contexto: RunContext): boolean {
  const campo = typeof config['field'] === 'string' ? config['field'] : '';
  if (campo === '') return false;

  const esquerda = normalizar(readPath(contexto, campo));
  const direita = normalizar(typeof config['value'] === 'string' ? config['value'] : '');

  switch (config['operator']) {
    case 'contains':
      return direita !== '' && esquerda.includes(direita);
    case 'equals':
      return esquerda === direita;
    case 'not_equals':
      return esquerda !== direita;
    case 'empty':
      return esquerda === '';
    case 'not_empty':
      return esquerda !== '';
    default:
      return false;
  }
}

/** Um valor da escolha múltipla: o id é a porta, e o valor é o que se compara. */
export interface SwitchCase {
  readonly id: string;
  readonly value: string;
}

/**
 * AU-15 — a lista de valores de uma escolha múltipla, lida com desconfiança.
 *
 * Caso sem id é descartado: sem id não há porta para ligar, e um valor sem saída seria um
 * caminho invisível no quadro.
 */
export function switchCases(config: Record<string, unknown>): SwitchCase[] {
  const bruto = config['cases'];
  if (!Array.isArray(bruto)) return [];

  const casos: SwitchCase[] = [];
  for (const item of bruto) {
    if (item === null || typeof item !== 'object') continue;
    const { id, value } = item as Record<string, unknown>;
    if (typeof id !== 'string' || id === '') continue;
    casos.push({ id, value: typeof value === 'string' ? value : '' });
  }
  return casos;
}

/**
 * AU-15 — por onde sai uma escolha múltipla.
 *
 * O primeiro valor que casa ganha, e por isso a ordem da lista é a ordem da regra. O que não
 * casa com nada vai pelo **padrão**: execução que para sem saída é a que ninguém descobre, e
 * "não pensei neste caso" é exatamente o que o padrão existe para receber.
 *
 * A comparação é a mesma de `contains` na condição — sem caixa, sem acento e por trecho —,
 * porque o uso é o mesmo: casar a palavra que o cliente digitou no meio de uma frase.
 */
export function resolveSwitch(config: Record<string, unknown>, contexto: RunContext): Port {
  const campo = typeof config['field'] === 'string' ? config['field'] : '';
  if (campo === '') return 'default';

  const lido = normalizar(readPath(contexto, campo));
  if (lido === '') return 'default';

  for (const caso of switchCases(config)) {
    const valor = normalizar(caso.value);
    if (valor !== '' && lido.includes(valor)) return `case_${caso.id}`;
  }
  return 'default';
}

/**
 * Quando a execução deve acordar. Unidade desconhecida cai em **minutos**, a mais curta: errar
 * para menos acorda cedo demais e alguém percebe; errar para dias esconde o problema por uma
 * semana.
 */
export function resolveDelay(config: Record<string, unknown>, agora: Date): Date {
  const minutos = Math.max(minutosDaEspera(config), ESPERA_MINIMA_MIN);
  return new Date(agora.getTime() + minutos * 60_000);
}

/**
 * Quantos minutos a espera pede, **sem** o piso. É o que o validador de grafo precisa para
 * recusar espera curta demais ao salvar (AU-07); quem aplica o piso é `resolveDelay`. Os dois
 * lendo a mesma conversão é o que impede a tela recusar um número que a execução aceitaria.
 */
export function minutosDaEspera(config: Record<string, unknown>): number {
  const bruto = Number(config['amount']);
  const quantidade = Number.isFinite(bruto) && bruto > 0 ? bruto : 0;
  return quantidade * (POR_UNIDADE[String(config['unit'])] ?? 1);
}

const POR_UNIDADE: Record<string, number> = {
  minutes: 1,
  hours: 60,
  days: 1440,
};

/**
 * Sem caixa e sem acento. Quem escreve "preço" na regra espera pegar "PRECO" digitado às
 * pressas no celular — e o contrário também.
 */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}
