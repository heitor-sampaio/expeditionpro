import {
  cents,
  effectiveFee,
  grossUpAmount,
  ImpossibleFeeError,
  parseLocalDate,
  sumCents,
  type Cents,
  type FeeSettings,
  type ProviderQuote,
} from '@expedition/domain';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../errors.js';
import { actorUserId } from '../audit/auditLogRepository.js';
import { bookingContracted } from '../bookings/bookingTotals.js';
import { ASAAS } from './connectPaymentProvider.js';
import type { RequestContext } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { BookingRecord, BookingRepository } from '../bookings/bookingRepository.js';
import type { CustomerRepository } from '../customers/customerRepository.js';
import type { PaymentRepository } from './paymentRepository.js';
import type { PaymentGateway } from './paymentGateway.js';
import type { PaymentChargeRecord, PaymentChargeRepository } from './paymentChargeRepository.js';
import type {
  PaymentEnvironment,
  PaymentIntegrationRepository,
} from './paymentIntegrationRepository.js';

/**
 * PG-02 — emite uma cobrança para a inscrição. Sem valor informado, cobra **o que falta**
 * (contratado − recebido): é o caso comum, e evita a equipe digitar um número que o
 * sistema já sabe. Com valor, cobra o valor — entrada, parcela, acerto.
 *
 * O valor informado (ou o saldo) é o **líquido**: o que precisa sobrar depois das taxas
 * do provedor. A cobrança sai pelo bruto (PG-04) — o cliente paga a taxa por cima, e a
 * inscrição fecha pelo valor combinado.
 *
 * A taxa da transação é **perguntada ao provedor** (PG-05), que sabe a faixa de parcelas
 * do plano contratado; só o custo de antecipar é configuração nossa, porque esse o
 * provedor não informa por API.
 *
 * A cobrança **não mexe no ledger**: dinheiro só entra quando o provedor avisar que foi
 * pago (PG-03). Emitir não é receber.
 */

export interface CreateBookingChargeDeps {
  readonly integrations: PaymentIntegrationRepository;
  readonly charges: PaymentChargeRepository;
  readonly gateway: PaymentGateway;
  readonly bookings: BookingRepository;
  readonly payments: PaymentRepository;
  readonly customers: CustomerRepository;
  readonly audit: AuditLogRepository;
  readonly clock: () => Date;
}

export interface CreateBookingChargeCommand {
  readonly bookingId: string;
  readonly environment: PaymentEnvironment;
  readonly billingType: string;
  readonly dueDate: string;
  /** PG-04: o **líquido** desejado. Ausente = o que falta pagar na inscrição. */
  readonly amountCents?: number | undefined;
  /** Parcelas no cartão; cada uma além da primeira soma a taxa de parcelamento. */
  readonly installments?: number | undefined;
}

export async function createBookingCharge(
  deps: CreateBookingChargeDeps,
  ctx: RequestContext,
  command: CreateBookingChargeCommand,
): Promise<PaymentChargeRecord> {
  const { actor } = ctx;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Emitir cobrança exige owner ou admin');
  }

  const booking = await deps.bookings.findById(ctx.tenantId, command.bookingId);
  if (!booking) {
    throw new NotFoundError('inscrição');
  }
  if (booking.status === 'cancelled' || booking.status === 'rejected') {
    throw new BusinessRuleError('booking_not_active', 'Inscrição cancelada não recebe cobrança');
  }

  const integration = await deps.integrations.find(ctx.tenantId, ASAAS, command.environment);
  if (!integration) {
    throw new BusinessRuleError(
      'gateway_not_connected',
      'Conecte a conta do ASAAS neste ambiente antes de cobrar',
    );
  }

  const netCents = command.amountCents ?? Number(await dueOf(deps, ctx, booking));
  if (!Number.isInteger(netCents) || netCents <= 0) {
    throw new BusinessRuleError('nothing_due', 'Não há valor em aberto nesta inscrição');
  }

  // PG-04/PG-05: o cliente paga o bruto; o líquido é o que fecha a inscrição.
  const installments = command.installments ?? 1;
  const credentials = {
    accessToken: integration.accessToken,
    environment: integration.environment,
  };
  const quote = await deps.gateway.simulate(credentials, {
    valueCents: netCents,
    billingType: command.billingType,
    installments,
  });
  if (!quote) {
    throw new BusinessRuleError(
      'quote_unavailable',
      'Não deu para consultar as taxas no ASAAS. Tente de novo em instantes.',
    );
  }
  const grossCents = grossUp(
    { percentBps: quote.percentBps, fixedCents: cents(quote.fixedCents) },
    integration.feeSettings,
    command.billingType,
    installments,
    netCents,
  );

  const responsible = await deps.customers.findById(ctx.tenantId, booking.responsibleCustomerId);
  if (!responsible) {
    throw new NotFoundError('responsável');
  }

  const dueDate = parseLocalDate(command.dueDate);
  const created = await deps.gateway.createCharge(credentials, {
    customer: {
      name: responsible.fullName,
      cpf: responsible.cpf,
      email: responsible.email,
      phone: responsible.phone,
    },
    amountCents: Number(grossCents),
    billingType: command.billingType,
    installments,
    dueDate,
    description: `Inscrição ${booking.id}`,
    externalReference: booking.id,
  });

  const charge = await deps.charges.create({
    tenantId: ctx.tenantId,
    bookingId: booking.id,
    provider: ASAAS,
    environment: integration.environment,
    externalId: created.externalId,
    installmentExternalId: created.installmentExternalId,
    amountCents: grossCents,
    netAmountCents: cents(netCents),
    installments,
    billingType: command.billingType,
    dueDate,
    status: 'pending',
    invoiceUrl: created.invoiceUrl,
    createdBy: actorUserId(actor),
  });

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(actor),
    entity: 'payment_charge',
    entityId: charge.id,
    action: 'payment_charge.create',
    diff: {
      bookingId: booking.id,
      netAmountCents: netCents,
      amountCents: Number(grossCents),
      billingType: command.billingType,
      installments,
    },
  });

  return charge;
}

/**
 * O bruto que deixa o líquido pedido. Taxa mal configurada (100% ou mais) vira erro de
 * regra com mensagem, não exceção crua vazando do domínio para a rota.
 */
function grossUp(
  quote: ProviderQuote,
  feeSettings: FeeSettings,
  billingType: string,
  installments: number,
  netCents: number,
): Cents {
  try {
    return grossUpAmount(
      cents(netCents),
      effectiveFee(quote, feeSettings, billingType, installments),
    );
  } catch (error) {
    if (error instanceof ImpossibleFeeError) {
      throw new BusinessRuleError('invalid_fee', error.message);
    }
    throw error;
  }
}

/** O que falta pagar: contratado − recebido, derivado do ledger como em toda a leitura. */
async function dueOf(
  deps: CreateBookingChargeDeps,
  ctx: RequestContext,
  booking: BookingRecord,
): Promise<Cents> {
  // CP-05: o saldo é o **contratado** — subtotal menos o desconto do cupom —, o mesmo
  // número que a mesa e o cashback leem. Somar os unitários crus aqui cobraria do
  // cliente o valor cheio de uma inscrição que ele fechou com desconto.
  const contracted = bookingContracted(booking);
  const received = sumCents(
    (await deps.payments.listByBooking(ctx.tenantId, booking.id)).map((p) => p.amountCents),
  );
  const due = contracted - received;
  return (due > 0 ? due : 0) as Cents;
}
