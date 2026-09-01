import type {
  GatewayCharge,
  GatewaySettlement,
  SettlementRef,
  GatewayQuote,
  GatewaySimulation,
  GatewayChargeInput,
  GatewayCredentials,
  PaymentGateway,
} from './paymentGateway.js';

/**
 * Fake do provedor. Aceita a chave que começa com `aact_` (é o prefixo do ASAAS) e
 * numera as cobranças; guarda o que recebeu para o teste conferir o que foi enviado.
 * Excluído do build (`*.fake.ts`).
 */
export function fakePaymentGateway(): PaymentGateway & {
  charges: GatewayChargeInput[];
  settlements: Map<string, GatewaySettlement>;
} {
  const charges: GatewayChargeInput[] = [];
  let seq = 0;

  // Faixas iguais às do plano real do drk, para o teste exercitar a mesma forma.
  const quoteFor = (billingType: string, installments: number): GatewayQuote => {
    if (billingType !== 'CREDIT_CARD') return { percentBps: 0, fixedCents: 99 };
    if (installments === 1) return { percentBps: 199, fixedCents: 49 };
    if (installments <= 6) return { percentBps: 249, fixedCents: 49 };
    return { percentBps: 299, fixedCents: 49 };
  };

  // O teste ajusta o realizado antes de conciliar.
  const settlements = new Map<string, GatewaySettlement>();

  return {
    charges,
    settlements,
    fetchSettlement(_credentials: GatewayCredentials, ref: SettlementRef) {
      const key = ref.installmentExternalId ?? ref.externalId;
      return Promise.resolve(settlements.get(key) ?? null);
    },
    simulate(_credentials: GatewayCredentials, simulation: GatewaySimulation) {
      return Promise.resolve(quoteFor(simulation.billingType, simulation.installments));
    },
    checkAccount(credentials: GatewayCredentials) {
      return Promise.resolve(
        credentials.accessToken.startsWith('aact_') ? { name: 'Drakkar Expedições' } : null,
      );
    },
    createCharge(credentials: GatewayCredentials, input: GatewayChargeInput) {
      charges.push(input);
      seq += 1;
      const host = credentials.environment === 'sandbox' ? 'sandbox.asaas.com' : 'asaas.com';
      const charge: GatewayCharge = {
        externalId: `pay_${seq}`,
        installmentExternalId: input.installments > 1 ? `inst_${seq}` : null,
        invoiceUrl: `https://${host}/i/pay_${seq}`,
        status: 'PENDING',
      };
      return Promise.resolve(charge);
    },
  };
}
