import { ForbiddenError, NotFoundError } from '../errors.js';
import { ASAAS } from './connectPaymentProvider.js';
import type { RequestContext } from '../context.js';
import type { PaymentGateway } from './paymentGateway.js';
import type { PaymentChargeRecord, PaymentChargeRepository } from './paymentChargeRepository.js';
import type { PaymentIntegrationRepository } from './paymentIntegrationRepository.js';

/**
 * PG-07 — conciliação: pergunta ao provedor o que **de fato** aconteceu com a cobrança e
 * guarda ao lado do que se esperava.
 *
 * Quatro números que respondem coisas diferentes:
 * - `amountCents` — o que foi cobrado do cliente;
 * - `netAmountCents` — o que se esperava receber quando a cobrança foi emitida;
 * - `settledNetCents` — o que **caiu na conta**;
 * - `awaitingCreditCents` — o que o cliente já pagou e ainda não caiu (cartão aprovado
 *   espera a data de crédito: D+30, ou dois dias úteis se antecipado).
 *
 * A diferença entre o esperado e o realizado é o que a conciliação existe para mostrar.
 * Nada aqui vira lançamento: o ledger continua com o que o cliente pagou (PG-03), e a
 * taxa segue sendo informação (decisão do dono do produto).
 */

export interface ReconcileChargeDeps {
  readonly charges: PaymentChargeRepository;
  readonly integrations: PaymentIntegrationRepository;
  readonly gateway: PaymentGateway;
  readonly clock: () => Date;
}

export interface ReconcileChargeCommand {
  readonly chargeId: string;
}

export async function reconcileCharge(
  deps: ReconcileChargeDeps,
  ctx: RequestContext,
  command: ReconcileChargeCommand,
): Promise<PaymentChargeRecord> {
  if (ctx.actor.kind !== 'team') {
    throw new ForbiddenError('A conciliação é da equipe');
  }

  const charge = await deps.charges.findById(ctx.tenantId, command.chargeId);
  if (!charge) {
    throw new NotFoundError('cobrança');
  }

  const integration = await deps.integrations.find(ctx.tenantId, ASAAS, charge.environment);
  if (!integration) {
    throw new NotFoundError('integração');
  }

  const settlement = await deps.gateway.fetchSettlement(
    { accessToken: integration.accessToken, environment: integration.environment },
    { externalId: charge.externalId, installmentExternalId: charge.installmentExternalId },
  );
  // Provedor sem resposta não apaga o que já foi conciliado antes: devolve o que se tem.
  if (!settlement) return charge;

  return deps.charges.saveSettlement(ctx.tenantId, charge.id, {
    settledGrossCents: settlement.paidCents,
    settledNetCents: settlement.creditedCents,
    awaitingCreditCents: settlement.awaitingCreditCents,
    anticipationFeeCents: settlement.anticipationFeeCents,
    paidInstallments: settlement.paidInstallments,
    creditedInstallments: settlement.creditedInstallments,
    nextCreditDate: settlement.nextCreditDate,
    reconciledAt: deps.clock(),
    // Cobrança emitida antes de guardarmos o id do parcelamento se conserta aqui: sem
    // isso, ela seguiria enxergando só a primeira parcela.
    ...(charge.installmentExternalId === null && settlement.installmentExternalId
      ? { installmentExternalId: settlement.installmentExternalId }
      : {}),
  });
}
