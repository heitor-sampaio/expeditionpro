import { cents, mapAsaasEvent } from '@expedition/domain';
import { ForbiddenError } from '../errors.js';
import { ASAAS } from './connectPaymentProvider.js';
import type { RequestContext } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { BookingRepository } from '../bookings/bookingRepository.js';
import type { PaymentRepository } from './paymentRepository.js';
import type { PaymentChargeRepository } from './paymentChargeRepository.js';
import type { PaymentIntegrationRepository } from './paymentIntegrationRepository.js';

/**
 * PG-03 — o webhook do ASAAS. Pago lá, o recebimento entra aqui e a inscrição confirma,
 * pela mesma regra de sempre: **o primeiro recebimento confirma** (IN-08). O que muda é
 * quem digita — ninguém.
 *
 * Três cuidados que o provedor cobra na prática:
 *
 * 1. **Autenticação pelo segredo**, não pela URL. O token vem no cabeçalho de toda
 *    chamada do ASAAS e é comparado com o que foi gerado ao conectar.
 * 2. **Idempotência por parcela.** O ASAAS reenvia até receber 200, e numa venda
 *    parcelada manda **um evento por parcela**, cada uma com id próprio. A marca de "já
 *    lançado" é o id da parcela guardado no `reference` do recebimento: o reenvio da
 *    parcela 3 encontra o lançamento dela e para, sem impedir a parcela 4 de entrar.
 * 3. **Silêncio em vez de erro.** Evento que não reconhecemos, ou cobrança que não é
 *    nossa, responde `handled: false` e 200 — devolver erro faria o provedor reenviar
 *    em laço para sempre.
 *
 * Nunca lança pelo conteúdo: só o token errado é recusado.
 *
 * **O que entra no ledger é o valor da inscrição** (PG-08), não o que o cliente pagou. A
 * taxa é repassada a ele: paga o bruto, e o provedor credita o líquido. Lançar o bruto
 * contaria como receita um dinheiro que nunca foi da empresa e deixaria a inscrição paga
 * a mais no valor exato da taxa.
 *
 * No **cartão**, o número de parcelas serve para calcular quanto cobrar, não para fatiar o
 * recebimento: a venda é aprovada inteira e o que muda é quando o dinheiro cai. Uma
 * cobrança no cartão gera **um** lançamento, pelo valor da inscrição.
 *
 * **Boleto e pix parcelados** são outra coisa: cada parcela é uma cobrança que o cliente
 * paga sozinha, e pode nunca pagar a seguinte. Ali cada uma quita a sua parte.
 */

export interface SettleChargeFromWebhookDeps {
  readonly integrations: PaymentIntegrationRepository;
  readonly charges: PaymentChargeRepository;
  readonly bookings: BookingRepository;
  readonly payments: PaymentRepository;
  readonly audit: AuditLogRepository;
  readonly clock: () => Date;
}

export interface SettleChargeFromWebhookCommand {
  readonly token: string;
  readonly body: unknown;
}

export interface WebhookOutcome {
  /** true = mudou alguma coisa aqui dentro (lançou recebimento ou mudou a cobrança). */
  readonly handled: boolean;
}

const IGNORED: WebhookOutcome = { handled: false };

export async function settleChargeFromWebhook(
  deps: SettleChargeFromWebhookDeps,
  ctx: RequestContext,
  command: SettleChargeFromWebhookCommand,
): Promise<WebhookOutcome> {
  const integration = await deps.integrations.findByWebhookToken(ctx.tenantId, command.token);
  if (!integration) {
    throw new ForbiddenError('Webhook não autenticado');
  }

  const event = mapAsaasEvent(command.body);
  if (event.kind === 'ignored') return IGNORED;

  // Numa venda parcelada, o id que a cobrança guarda é o do **parcelamento**: cada
  // parcela chega com um id próprio e encontra a cobrança por ele.
  const charge = await deps.charges.findByExternalId(
    ctx.tenantId,
    ASAAS,
    event.chargeExternalId,
    event.installmentExternalId,
  );
  if (!charge) return IGNORED;

  if (event.kind === 'status') {
    await deps.charges.setStatus(ctx.tenantId, charge.id, event.status);
    return { handled: true };
  }

  const booking = await deps.bookings.findById(ctx.tenantId, charge.bookingId);
  if (!booking) return IGNORED;

  // Já lançado: o provedor está reenviando **esta** parcela. Nada a fazer, e 200 para ele
  // parar. A marca é o id da parcela, não a cobrança — senão a parcela 2 seria barrada
  // pela 1 e o dinheiro nunca entraria.
  const existing = await deps.payments.listByBooking(ctx.tenantId, charge.bookingId);
  if (existing.some((payment) => payment.reference === event.chargeExternalId)) {
    return IGNORED;
  }

  const now = deps.clock();
  const settledCents = quitationOf(charge, event.amountCents, existing);
  // Cartão já quitado pela primeira parcela: as seguintes são o mesmo dinheiro chegando
  // em pedaços, e só interessam à conciliação.
  if (settledCents <= 0) return IGNORED;

  const payment = await deps.payments.create(
    {
      tenantId: ctx.tenantId,
      bookingId: charge.bookingId,
      paidAt: event.paidAt,
      amountCents: cents(settledCents),
      // No cartão o lançamento representa a venda inteira: o cliente pagou o bruto todo,
      // ainda que o dinheiro chegue em parcelas.
      customerPaidCents: cents(
        charge.billingType === 'CREDIT_CARD' ? Number(charge.amountCents) : event.amountCents,
      ),
      chargeId: charge.id,
      method: event.method,
      reference: event.chargeExternalId,
      notes: null,
      createdBy: null,
    },
    // IN-08: o primeiro recebimento confirma. Sem `confirmedBy`: quem confirmou foi o
    // dinheiro, e o "quem" fica na trilha, com o id da cobrança.
    booking.status === 'pending' ? { confirmedBy: null, confirmedAt: now } : null,
  );

  // A cobrança fica marcada pela **primeira** parcela liquidada: é o que responde
  // "começou a ser paga". O total recebido continua sendo a soma do ledger.
  if (charge.bookingPaymentId === null) {
    await deps.charges.markSettled(ctx.tenantId, charge.id, payment.id, now);
  }
  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: null,
    entity: 'payment_charge',
    entityId: charge.id,
    action: 'payment_charge.settled',
    diff: {
      provider: ASAAS,
      externalId: event.chargeExternalId,
      amountCents: settledCents,
      customerPaidCents:
        charge.billingType === 'CREDIT_CARD' ? Number(charge.amountCents) : event.amountCents,
      bookingId: charge.bookingId,
    },
  });

  return { handled: true };
}

/**
 * Quanto este pagamento quita da inscrição.
 *
 * **Cartão**: o valor cheio da cobrança, de uma vez. A venda foi aprovada inteira; as
 * parcelas seguintes não acrescentam quitação (devolvem zero e o evento é ignorado).
 *
 * **Boleto e pix**: a parte proporcional (`líquido / bruto`), porque cada parcela é paga
 * sozinha. O que já foi quitado entra na conta, então a última leva o arredondamento e a
 * inscrição fecha exata.
 */
function quitationOf(
  charge: {
    id: string;
    amountCents: number;
    netAmountCents: number;
    billingType: string;
  },
  paidCents: number,
  existing: readonly { chargeId: string | null; amountCents: number }[],
): number {
  const gross = Number(charge.amountCents);
  const net = Number(charge.netAmountCents);
  if (gross <= 0 || net <= 0) return paidCents;

  const alreadySettled = existing
    .filter((payment) => payment.chargeId === charge.id)
    .reduce((sum, payment) => sum + Number(payment.amountCents), 0);
  const remaining = Math.max(0, net - alreadySettled);

  if (charge.billingType === 'CREDIT_CARD') return remaining;
  return Math.min(Math.round((paidCents * net) / gross), remaining);
}
