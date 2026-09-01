import { describe, expect, it } from 'vitest';
import { cents } from '../money/cents.js';
import { effectiveFee, grossUpAmount, netOfFee, ImpossibleFeeError } from './grossUp.js';

/**
 * PG-04 — a cobrança parte do **líquido**: o que precisa sobrar para a empresa depois das
 * taxas. São duas taxas com bases diferentes: a transação incide sobre o bruto, e a
 * antecipação sobre o que sobra depois dela.
 */

const SO_TRANSACAO = { transactionBps: 299, fixedCents: cents(49), anticipationBps: 0 };

describe('PG-04: do líquido desejado para o bruto cobrado', () => {
  it('taxa só fixa: o bruto é o líquido mais a taxa', () => {
    expect(
      grossUpAmount(cents(389000), {
        transactionBps: 0,
        fixedCents: cents(199),
        anticipationBps: 0,
      }),
    ).toBe(389199);
  });

  it('a taxa da transação incide sobre o bruto, não sobre o líquido', () => {
    const bruto = grossUpAmount(cents(389000), SO_TRANSACAO);
    expect(bruto).toBe(401041);
    const taxa = Math.round((bruto * 299) / 10000) + 49;
    expect(bruto - taxa).toBeGreaterThanOrEqual(389000);
  });

  it('a antecipação incide sobre o que sobra da transação — bases diferentes', () => {
    const fee = { transactionBps: 249, fixedCents: cents(49), anticipationBps: 635 };
    const bruto = grossUpAmount(cents(208000), fee);

    const aposTransacao = bruto - Math.round((bruto * 249) / 10000) - 49;
    const aposAntecipacao = aposTransacao - Math.round((aposTransacao * 635) / 10000);
    expect(aposAntecipacao).toBeGreaterThanOrEqual(208000);
  });

  it('arredonda para cima: sobrar um centavo a mais é aceitável, a menos não', () => {
    const bruto = grossUpAmount(cents(10000), {
      transactionBps: 299,
      fixedCents: cents(0),
      anticipationBps: 0,
    });
    expect(bruto - Math.round((bruto * 299) / 10000)).toBeGreaterThanOrEqual(10000);
  });

  it('sem taxa nenhuma, bruto é o próprio líquido', () => {
    expect(
      grossUpAmount(cents(389000), { transactionBps: 0, fixedCents: cents(0), anticipationBps: 0 }),
    ).toBe(389000);
  });

  it('taxa que consome tudo não tem solução: erro em vez de número absurdo', () => {
    expect(() =>
      grossUpAmount(cents(100000), {
        transactionBps: 10000,
        fixedCents: cents(0),
        anticipationBps: 0,
      }),
    ).toThrow(ImpossibleFeeError);
    expect(() =>
      grossUpAmount(cents(100000), {
        transactionBps: 0,
        fixedCents: cents(0),
        anticipationBps: 10000,
      }),
    ).toThrow(ImpossibleFeeError);
  });
});

/**
 * A antecipação é juros ao mês por parcela, proporcional ao prazo dela. No ASAAS, sem
 * antecipar, cada parcela é liberada a cada **32 dias** — não 30. Em 6x isso dá 3,73
 * meses de prazo médio, não 3,5.
 */
describe('PG-04/PG-05: a taxa que vale para esta cobrança', () => {
  const cotacaoCartao = { percentBps: 249, fixedCents: cents(49) };
  const cotacaoPix = { percentBps: 0, fixedCents: cents(99) };
  const antecipa = { card: { anticipationMonthlyBps: 170 } };

  it('sem antecipação, a taxa é exatamente a que o provedor cobra', () => {
    expect(effectiveFee(cotacaoCartao, {}, 'CREDIT_CARD', 6)).toEqual({
      transactionBps: 249,
      fixedCents: 49,
      anticipationBps: 0,
    });
  });

  it('pix e boleto não pagam antecipação — o dinheiro cai na hora ou no dia seguinte', () => {
    const tudoAntecipado = {
      pix: { anticipationMonthlyBps: 500 },
      card: { anticipationMonthlyBps: 500 },
    };
    expect(effectiveFee(cotacaoPix, tudoAntecipado, 'PIX', 1).anticipationBps).toBe(0);
  });

  it('cartão à vista: um ciclo de espera (32 dias)', () => {
    // 1,70% × (32/30) × 1 = 1,813%
    expect(effectiveFee(cotacaoCartao, antecipa, 'CREDIT_CARD', 1).anticipationBps).toBe(181);
  });

  it('em 6x o prazo médio é 3,73 meses — a média dos ciclos, não a soma', () => {
    // 1,70% × (32/30) × 3,5 = 6,347%
    expect(effectiveFee(cotacaoCartao, antecipa, 'CREDIT_CARD', 6).anticipationBps).toBe(635);
  });

  it('o ciclo de liberação é configurável — 30 dias muda a conta', () => {
    const trintaDias = { card: { anticipationMonthlyBps: 170, settlementCycleDays: 30 } };
    expect(effectiveFee(cotacaoCartao, trintaDias, 'CREDIT_CARD', 6).anticipationBps).toBe(595);
  });

  it('a taxa da transação passa intacta: ela é do provedor', () => {
    const fee = effectiveFee(
      { percentBps: 199, fixedCents: cents(49) },
      antecipa,
      'CREDIT_CARD',
      1,
    );
    expect(fee.transactionBps).toBe(199);
    expect(fee.fixedCents).toBe(49);
  });
});

/**
 * O caso real que calibrou o modelo: R$ 2.080,00 líquidos em 6x. O provedor cobra 2,49%
 * + R$ 0,49 nessa faixa e libera uma parcela a cada 32 dias; a antecipação é 1,70% ao mês.
 * O simulador do ASAAS: cobrando R$ 2.278,81, sobram R$ 2.080.
 */
describe('PG-04: o caso do drk — 2.080 líquidos em 6x', () => {
  const fee = effectiveFee(
    { percentBps: 249, fixedCents: cents(49) },
    { card: { anticipationMonthlyBps: 170 } },
    'CREDIT_CARD',
    6,
  );

  it('cobra o bruto que o simulador do provedor confirma, com folga de centavos', () => {
    const bruto = grossUpAmount(cents(208000), fee);
    expect(bruto).toBeGreaterThan(227000);
    expect(bruto).toBeLessThan(228000);
  });

  it('o que sobra depois das duas taxas cobre o líquido pedido', () => {
    const bruto = grossUpAmount(cents(208000), fee);
    const aposTransacao = bruto - Math.round((bruto * fee.transactionBps) / 10000) - fee.fixedCents;
    const sobra = aposTransacao - Math.round((aposTransacao * fee.anticipationBps) / 10000);
    expect(sobra).toBeGreaterThanOrEqual(208000);
  });
});

/**
 * PG-09 — o caminho inverso do gross-up: dado o que o cliente pagou, quanto entra na
 * conta. Serve para o lançamento manual, que também passa pelo provedor: um pix de
 * R$ 100 deixa R$ 99,01 quando a taxa fixa é R$ 0,99.
 */
describe('PG-09: do que o cliente pagou para o que entra na conta', () => {
  it('desconta a taxa fixa', () => {
    expect(
      netOfFee(cents(10000), { transactionBps: 0, fixedCents: cents(99), anticipationBps: 0 }),
    ).toBe(9901);
  });

  it('desconta percentual e fixa, nessa ordem — o percentual é sobre o que foi pago', () => {
    // 1,99% de 100,00 = 1,99, mais R$ 0,49
    expect(
      netOfFee(cents(10000), { transactionBps: 199, fixedCents: cents(49), anticipationBps: 0 }),
    ).toBe(9752);
  });

  it('desconta a antecipação sobre o que sobra da transação', () => {
    // 100,00 − 2,49% = 97,51 − 0,49 = 97,02; menos 6,35% = 90,86
    const fee = { transactionBps: 249, fixedCents: cents(49), anticipationBps: 635 };
    expect(netOfFee(cents(10000), fee)).toBe(9086);
  });

  it('sem taxa, entra o que foi pago', () => {
    expect(
      netOfFee(cents(10000), { transactionBps: 0, fixedCents: cents(0), anticipationBps: 0 }),
    ).toBe(10000);
  });

  it('taxa maior que o valor não deixa dívida: o piso é zero', () => {
    expect(
      netOfFee(cents(50), { transactionBps: 0, fixedCents: cents(99), anticipationBps: 0 }),
    ).toBe(0);
  });

  it('é o inverso do gross-up: cobrar o bruto de X deixa X', () => {
    const fee = { transactionBps: 249, fixedCents: cents(49), anticipationBps: 0 };
    const bruto = grossUpAmount(cents(208000), fee);
    expect(netOfFee(bruto, fee)).toBeGreaterThanOrEqual(208000);
  });
});
