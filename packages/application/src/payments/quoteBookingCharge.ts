import { cents, effectiveFee, grossUpAmount, ImpossibleFeeError } from '@expedition/domain';
import { BusinessRuleError, ForbiddenError } from '../errors.js';
import { ASAAS } from './connectPaymentProvider.js';
import type { RequestContext } from '../context.js';
import type { PaymentGateway } from './paymentGateway.js';
import type {
  PaymentEnvironment,
  PaymentIntegrationRepository,
} from './paymentIntegrationRepository.js';

/**
 * PG-05 — quanto o cliente paga para sobrar o líquido pedido, **antes** de emitir. A tela
 * mostra isso ao lado do valor digitado.
 *
 * Existe como caso de uso próprio (e não como conta no front) por um motivo: a taxa é a
 * que o provedor informa, e o número que a tela promete tem que ser o mesmo que a emissão
 * usa. Duas contas em lugares diferentes divergem no dia em que o plano mudar.
 */

export interface QuoteBookingChargeDeps {
  readonly integrations: PaymentIntegrationRepository;
  readonly gateway: PaymentGateway;
}

export interface QuoteBookingChargeCommand {
  readonly environment: PaymentEnvironment;
  readonly billingType: string;
  readonly netAmountCents: number;
  readonly installments?: number | undefined;
}

export interface ChargeQuote {
  readonly netAmountCents: number;
  readonly grossAmountCents: number;
  /** Taxa da transação (do provedor), sobre o bruto. */
  readonly transactionBps: number;
  readonly fixedCents: number;
  /** Antecipação, sobre o que sobra da transação. */
  readonly anticipationBps: number;
}

export async function quoteBookingCharge(
  deps: QuoteBookingChargeDeps,
  ctx: RequestContext,
  command: QuoteBookingChargeCommand,
): Promise<ChargeQuote> {
  if (ctx.actor.kind !== 'team') {
    throw new ForbiddenError('A cobrança é da equipe');
  }

  const integration = await deps.integrations.find(ctx.tenantId, ASAAS, command.environment);
  if (!integration) {
    throw new BusinessRuleError(
      'gateway_not_connected',
      'Conecte a conta do ASAAS neste ambiente antes de cobrar',
    );
  }

  const installments = command.installments ?? 1;
  const quote = await deps.gateway.simulate(
    { accessToken: integration.accessToken, environment: integration.environment },
    {
      valueCents: command.netAmountCents,
      billingType: command.billingType,
      installments,
    },
  );
  if (!quote) {
    throw new BusinessRuleError(
      'quote_unavailable',
      'Não deu para consultar as taxas no ASAAS. Tente de novo em instantes.',
    );
  }

  const fee = effectiveFee(
    { percentBps: quote.percentBps, fixedCents: cents(quote.fixedCents) },
    integration.feeSettings,
    command.billingType,
    installments,
  );

  try {
    return {
      netAmountCents: command.netAmountCents,
      grossAmountCents: Number(grossUpAmount(cents(command.netAmountCents), fee)),
      transactionBps: fee.transactionBps,
      fixedCents: Number(fee.fixedCents),
      anticipationBps: fee.anticipationBps,
    };
  } catch (error) {
    if (error instanceof ImpossibleFeeError) {
      throw new BusinessRuleError('invalid_fee', error.message);
    }
    throw error;
  }
}
