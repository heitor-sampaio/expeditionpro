/**
 * IN-25 — o mês de uma saída, do jeito que cabe num link de anúncio.
 *
 * O botão do site de apresentação carrega a saída em `?saida=jan-27`, e é daí que o sistema
 * sabe para qual grupo a inscrição vai. O formato é curto de propósito: quem cola o link num
 * anúncio precisa conseguir ler o que está colando, e `2027-01` não se lê de relance.
 *
 * Mora no domínio porque as duas pontas dependem dele — a borda pública lê o que chegou, e a
 * agenda **escreve** o link que a equipe copia. Duas tabelas de mês seriam duas verdades, e o
 * dia em que divergissem o link nasceria quebrado sem ninguém notar.
 */

export interface MonthYear {
  readonly year: number;
  /** 1 a 12, como no `LocalDate` — não o zero-based do `Date`. */
  readonly month: number;
}

export const MONTH_ABBR_PT_BR = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
] as const;

/*
 * Três letras e dois ou quatro dígitos. `01-27` fica de fora de propósito: com dois números não
 * dá para saber se é mês-ano ou dia-mês, e aceitar abriria um segundo jeito de dizer a mesma
 * coisa — que é como um vocabulário começa a divergir.
 */
const FORMATO = /^([a-zç]{3})-(\d{2}|\d{4})$/;

/**
 * `null` quando não dá para ler, e nunca uma exceção: parâmetro torto de URL é um estado de
 * tela ("não reconheci a data do link; escolha uma"), não um erro de programa. Mês que não
 * existe em português também vira `null` — link errado tem que ficar visível, não virar
 * silenciosamente outro mês.
 */
export function parseMonthYearPtBr(bruto: string): MonthYear | null {
  const partes = FORMATO.exec(bruto.trim().toLowerCase());
  if (partes === null) return null;

  const month = MONTH_ABBR_PT_BR.indexOf(partes[1] as (typeof MONTH_ABBR_PT_BR)[number]) + 1;
  if (month === 0) return null;

  /*
   * Dois dígitos são **sempre** 20xx. Uma janela móvel ("±50 anos de hoje") é esperta e
   * imprevisível: o mesmo link passaria a significar outra coisa com o tempo. Este sistema vende
   * expedição, não história, e `jan-00` simplesmente não acha saída nenhuma — inofensivo.
   */
  const digitos = partes[2]!;
  const year = digitos.length === 2 ? 2000 + Number(digitos) : Number(digitos);

  return { year, month };
}

/** O caminho de volta: é ele que deixa a equipe **gerar** o link em vez de digitá-lo. */
export function formatMonthYearPtBr(mes: MonthYear): string {
  const abreviacao = MONTH_ABBR_PT_BR[mes.month - 1] ?? '';
  return `${abreviacao}-${String(mes.year % 100).padStart(2, '0')}`;
}
