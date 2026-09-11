import { describe, expect, it } from 'vitest';
import { formatMonthYearPtBr, MONTH_ABBR_PT_BR, parseMonthYearPtBr } from './monthYearPtBr.js';

/**
 * IN-25 — o mês de uma saída, do jeito que cabe num link de anúncio.
 *
 * O botão do site carrega a saída em `?saida=jan-27`, e é daí que o sistema sabe para qual
 * grupo a inscrição vai. O formato é curto de propósito: quem cola o link num anúncio precisa
 * conseguir ler o que está colando.
 */
describe('IN-25: ler o mês de uma saída', () => {
  it('lê o formato do link', () => {
    expect(parseMonthYearPtBr('jan-27')).toEqual({ year: 2027, month: 1 });
    expect(parseMonthYearPtBr('dez-26')).toEqual({ year: 2026, month: 12 });
  });

  /** CMS, encurtador e gente mexem na caixa. Ela não carrega significado nenhum aqui. */
  it('aceita qualquer caixa e espaço em volta', () => {
    expect(parseMonthYearPtBr('JAN-27')).toEqual({ year: 2027, month: 1 });
    expect(parseMonthYearPtBr('Jan-27')).toEqual({ year: 2027, month: 1 });
    expect(parseMonthYearPtBr('  jan-27  ')).toEqual({ year: 2027, month: 1 });
  });

  /** Quem escreve o link à mão erra para o ano cheio. Perdoar é barato. */
  it('aceita o ano de quatro dígitos', () => {
    expect(parseMonthYearPtBr('jan-2027')).toEqual({ year: 2027, month: 1 });
  });

  /**
   * **Dois dígitos são sempre 20xx.** Janela móvel — "±50 anos de hoje" — é esperta e
   * imprevisível: o mesmo link passaria a significar outra coisa com o tempo. Este sistema
   * vende expedição, não história, e `jan-00` simplesmente não acha saída nenhuma.
   */
  it('o ano de dois dígitos é sempre 20xx', () => {
    expect(parseMonthYearPtBr('jan-00')).toEqual({ year: 2000, month: 1 });
    expect(parseMonthYearPtBr('jan-99')).toEqual({ year: 2099, month: 1 });
  });

  /**
   * `01-27` é recusado de propósito: com dois números não dá para saber se é mês-ano ou
   * dia-mês, e aceitar abriria um segundo jeito de dizer a mesma coisa. Mês que não existe em
   * português também é recusado — link errado tem que ficar visível, não virar outro mês.
   */
  it.each(['01-27', 'sep-27', 'jan/27', 'jan_27', 'jan27', 'jan-', '-27', '', 'janeiro-27'])(
    '%s não é um mês de saída',
    (bruto) => {
      expect(parseMonthYearPtBr(bruto)).toBeNull();
    },
  );

  /** Não lança: parâmetro torto de URL é estado de tela ("não reconheci"), não exceção. */
  it('o que não dá para ler vira nulo, e não erro', () => {
    expect(() => parseMonthYearPtBr('%%%')).not.toThrow();
  });
});

/**
 * IN-25 — o caminho de volta, que é o que permite a equipe **gerar** o link a partir da agenda.
 * Sem ele, alguém digita "Jan-27" à mão e o link nasce quebrado.
 */
describe('IN-25: escrever o mês de uma saída', () => {
  it('escreve no formato do link', () => {
    expect(formatMonthYearPtBr({ year: 2027, month: 1 })).toBe('jan-27');
    expect(formatMonthYearPtBr({ year: 2026, month: 12 })).toBe('dez-26');
  });

  it('ler de volta o que se escreveu devolve o mesmo mês', () => {
    for (let month = 1; month <= 12; month += 1) {
      const mes = { year: 2027, month };
      expect(parseMonthYearPtBr(formatMonthYearPtBr(mes))).toEqual(mes);
    }
  });

  it('os doze meses estão na tabela, na ordem', () => {
    expect(MONTH_ABBR_PT_BR).toHaveLength(12);
    expect(MONTH_ABBR_PT_BR[0]).toBe('jan');
    expect(MONTH_ABBR_PT_BR[11]).toBe('dez');
  });
});
