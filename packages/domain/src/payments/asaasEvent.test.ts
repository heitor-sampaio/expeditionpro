import { describe, expect, it } from 'vitest';
import { parseLocalDate } from '../date/localDate.js';
import { mapAsaasEvent } from './asaasEvent.js';

/**
 * PG-01 — o webhook do ASAAS chega como corpo arbitrário e vira um fato do nosso
 * vocabulário: *esta cobrança foi paga, tanto, assim, neste dia*. Mapeador puro, como o
 * do formulário de inscrição — o que ele não entende vira `ignored`, nunca exceção: um
 * evento novo do provedor não pode derrubar o webhook.
 */

const PAGO = {
  id: 'evt_001',
  event: 'PAYMENT_RECEIVED',
  payment: {
    id: 'pay_123',
    value: 1250.5,
    billingType: 'PIX',
    status: 'RECEIVED',
    dueDate: '2026-09-01',
    paymentDate: '2026-08-28',
    externalReference: 'booking-1',
    invoiceUrl: 'https://asaas.com/i/123',
  },
};

describe('PG-01: o evento do ASAAS vira fato de recebimento', () => {
  it('recebimento traz cobrança, valor em centavos, método e data do pagamento', () => {
    expect(mapAsaasEvent(PAGO)).toEqual({
      kind: 'received',
      chargeExternalId: 'pay_123',
      installmentExternalId: null,
      amountCents: 125050,
      method: 'pix',
      paidAt: parseLocalDate('2026-08-28'),
    });
  });

  it('parcela traz o id do parcelamento — é por ele que a cobrança daqui é achada', () => {
    const parcela = {
      ...PAGO,
      payment: { ...PAGO.payment, id: 'pay_parcela_3', installment: 'inst_abc', value: 398.74 },
    };
    expect(mapAsaasEvent(parcela)).toMatchObject({
      kind: 'received',
      chargeExternalId: 'pay_parcela_3',
      installmentExternalId: 'inst_abc',
      amountCents: 39874,
    });
  });

  it('centavos vêm de arredondamento, não de multiplicação crua de float', () => {
    const evento = { ...PAGO, payment: { ...PAGO.payment, value: 19.99 } };
    const mapped = mapAsaasEvent(evento);
    expect(mapped.kind === 'received' && mapped.amountCents).toBe(1999);
  });

  it('sem data de pagamento, o dia é o do vencimento — o fato aconteceu, a data não veio', () => {
    const evento = { ...PAGO, payment: { ...PAGO.payment, paymentDate: null } };
    const mapped = mapAsaasEvent(evento);
    expect(mapped.kind === 'received' && mapped.paidAt).toEqual(parseLocalDate('2026-09-01'));
  });

  it('cada forma de pagamento vira o método do ledger', () => {
    const metodo = (billingType: string) => {
      const mapped = mapAsaasEvent({ ...PAGO, payment: { ...PAGO.payment, billingType } });
      return mapped.kind === 'received' ? mapped.method : null;
    };
    expect(metodo('PIX')).toBe('pix');
    expect(metodo('BOLETO')).toBe('boleto');
    expect(metodo('CREDIT_CARD')).toBe('card');
    expect(metodo('DEBIT_CARD')).toBe('card');
    // Forma desconhecida ainda é dinheiro que entrou: não se perde o recebimento por isso.
    expect(metodo('CRYPTO')).toBe('pix');
  });

  it('confirmado ainda não é recebido: muda o estado da cobrança, não o caixa', () => {
    const mapped = mapAsaasEvent({
      ...PAGO,
      event: 'PAYMENT_CONFIRMED',
      payment: { ...PAGO.payment, status: 'CONFIRMED' },
    });
    expect(mapped).toEqual({
      kind: 'status',
      chargeExternalId: 'pay_123',
      installmentExternalId: null,
      status: 'confirmed',
    });
  });

  it('vencida, estornada e apagada mudam só o estado da cobrança', () => {
    const evento = (event: string) => mapAsaasEvent({ ...PAGO, event });
    expect(evento('PAYMENT_OVERDUE')).toEqual({
      kind: 'status',
      chargeExternalId: 'pay_123',
      installmentExternalId: null,
      status: 'overdue',
    });
    expect(evento('PAYMENT_REFUNDED')).toEqual({
      kind: 'status',
      chargeExternalId: 'pay_123',
      installmentExternalId: null,
      status: 'refunded',
    });
    expect(evento('PAYMENT_DELETED')).toEqual({
      kind: 'status',
      chargeExternalId: 'pay_123',
      installmentExternalId: null,
      status: 'cancelled',
    });
  });

  it('evento desconhecido ou corpo torto é ignorado, nunca exceção', () => {
    expect(mapAsaasEvent({ ...PAGO, event: 'PAYMENT_ANTICIPATED' }).kind).toBe('ignored');
    expect(mapAsaasEvent({ event: 'PAYMENT_RECEIVED' }).kind).toBe('ignored');
    expect(mapAsaasEvent(null).kind).toBe('ignored');
    expect(mapAsaasEvent('texto solto').kind).toBe('ignored');
    expect(mapAsaasEvent({ ...PAGO, payment: { ...PAGO.payment, value: 0 } }).kind).toBe('ignored');
  });
});
