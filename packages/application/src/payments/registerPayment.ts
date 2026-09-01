import { cents, effectiveFee, netOfFee, parseLocalDate } from '@expedition/domain';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import type { BookingRepository } from '../bookings/bookingRepository.js';
import type { BookingConfirmation, PaymentRecord, PaymentRepository } from './paymentRepository.js';
import type { PaymentIntegrationRepository } from './paymentIntegrationRepository.js';
import type { PaymentGateway } from './paymentGateway.js';
import { ASAAS } from './connectPaymentProvider.js';

/**
 * IN-08/IN-09/GR-05 — lança um recebimento numa inscrição. O primeiro recebimento
 * (inscrição ainda `pending`) a confirma na MESMA transação, gravando quem e quando.
 * Só `owner` e `admin` lançam (IN-09), pois é o ato que confirma. Inscrição cancelada
 * ou recusada não recebe pagamento novo.
 *
 * `clock` injeta o instante da confirmação — data corrente é borda, nunca `new Date()`
 * escondido no meio do caso de uso (testabilidade).
 *
 * **PG-09**: o valor informado é o que o cliente pagou; o que entra na conta é ele menos a
 * taxa do provedor, porque o recebimento também passa pelo ASAAS. Dinheiro em espécie não
 * passa por gateway nenhum e entra integral — e, sem conta conectada, não há taxa a
 * descontar: o lançamento continua funcionando.
 */

export interface RegisterPaymentDeps {
  readonly payments: PaymentRepository;
  readonly bookings: BookingRepository;
  readonly clock: () => Date;
  /** PG-09: para saber a taxa do provedor. Ausente = lançamento entra integral. */
  readonly integrations?: PaymentIntegrationRepository | undefined;
  readonly gateway?: PaymentGateway | undefined;
}

export interface RegisterPaymentCommand {
  readonly bookingId: string;
  readonly amountCents: number;
  readonly method: string;
  readonly paidAt: string;
  readonly reference?: string | undefined;
  readonly notes?: string | undefined;
}

export interface RegisteredPayment {
  readonly payment: PaymentRecord;
  readonly confirmedNow: boolean;
}

export async function registerPayment(
  deps: RegisterPaymentDeps,
  ctx: RequestContext,
  command: RegisterPaymentCommand,
): Promise<RegisteredPayment> {
  const actor = ctx.actor;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Lançar recebimento exige owner ou admin');
  }
  if (!Number.isInteger(command.amountCents) || command.amountCents <= 0) {
    throw new BusinessRuleError('invalid_amount', 'Valor do recebimento deve ser positivo');
  }

  const booking = await deps.bookings.findById(ctx.tenantId, command.bookingId);
  if (!booking) {
    throw new NotFoundError('inscrição');
  }
  if (booking.status === 'cancelled' || booking.status === 'rejected') {
    throw new BusinessRuleError(
      'booking_not_active',
      'Inscrição cancelada ou recusada não recebe pagamento',
    );
  }

  const settledCents = await netOfProviderFee(deps, ctx, command);
  const confirmsNow = booking.status === 'pending';
  const confirmation: BookingConfirmation | null = confirmsNow
    ? { confirmedBy: actor.userId, confirmedAt: deps.clock() }
    : null;

  const payment = await deps.payments.create(
    {
      tenantId: ctx.tenantId,
      bookingId: command.bookingId,
      paidAt: parseLocalDate(command.paidAt),
      amountCents: cents(settledCents),
      customerPaidCents: cents(command.amountCents),
      method: command.method,
      reference: blankToNull(command.reference),
      notes: blankToNull(command.notes),
      createdBy: actor.userId,
    },
    confirmation,
  );

  return { payment, confirmedNow: confirmsNow };
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** A forma como o provedor a chama. Dinheiro em espécie não passa por ele. */
const PROVIDER_BILLING: Record<string, string> = {
  pix: 'PIX',
  boleto: 'BOLETO',
  card: 'CREDIT_CARD',
};

/**
 * Quanto entra na conta por este recebimento. A taxa é a que o provedor informa para
 * aquela forma de pagamento; sem conta conectada, ou se a consulta falhar, entra o valor
 * cheio — melhor um lançamento sem desconto do que nenhum lançamento.
 */
async function netOfProviderFee(
  deps: RegisterPaymentDeps,
  ctx: RequestContext,
  command: RegisterPaymentCommand,
): Promise<number> {
  const billingType = PROVIDER_BILLING[command.method];
  if (!billingType || !deps.integrations || !deps.gateway) return command.amountCents;

  const integration =
    (await deps.integrations.find(ctx.tenantId, ASAAS, 'production')) ??
    (await deps.integrations.find(ctx.tenantId, ASAAS, 'sandbox'));
  if (!integration) return command.amountCents;

  const quote = await deps.gateway.simulate(
    { accessToken: integration.accessToken, environment: integration.environment },
    { valueCents: command.amountCents, billingType, installments: 1 },
  );
  if (!quote) return command.amountCents;

  const fee = effectiveFee(
    { percentBps: quote.percentBps, fixedCents: cents(quote.fixedCents) },
    integration.feeSettings,
    billingType,
    1,
  );
  return Number(netOfFee(cents(command.amountCents), fee));
}
