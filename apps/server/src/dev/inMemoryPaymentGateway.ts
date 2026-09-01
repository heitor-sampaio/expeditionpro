import type {
  ChargeSettlement,
  NewPaymentCharge,
  NewPaymentIntegration,
  PaymentChargeRecord,
  PaymentChargeRepository,
  PaymentEnvironment,
  PaymentIntegrationRecord,
  PaymentIntegrationRepository,
} from '@expedition/application';
import type { AsaasChargeStatus, FeeSettings } from '@expedition/domain';

/**
 * PG-01/PG-02 em memória — SÓ para dev sem banco. Guarda a credencial em claro, o que é
 * aceitável exatamente porque nada aqui sobrevive ao processo: em produção a cifra é
 * obrigatória (ver `paymentGatewayDeps`).
 */
export function inMemoryPaymentIntegrations(): PaymentIntegrationRepository {
  const rows: (PaymentIntegrationRecord & { tenantId: string })[] = [];
  let seq = 0;

  const indexOf = (tenantId: string, provider: string, environment: PaymentEnvironment) =>
    rows.findIndex(
      (r) => r.tenantId === tenantId && r.provider === provider && r.environment === environment,
    );

  return {
    upsert(integration: NewPaymentIntegration) {
      const index = indexOf(integration.tenantId, integration.provider, integration.environment);
      seq += 1;
      const record = {
        id: index >= 0 ? rows[index]!.id : `dev-pi-${seq}`,
        tenantId: integration.tenantId,
        provider: integration.provider,
        environment: integration.environment,
        accessToken: integration.accessToken,
        webhookToken: integration.webhookToken,
        accountName: integration.accountName,
        feeSettings: index >= 0 ? rows[index]!.feeSettings : {},
        active: true,
        connectedAt: integration.connectedAt,
        lastCheckedAt: integration.connectedAt,
      };
      if (index >= 0) rows[index] = record;
      else rows.push(record);
      return Promise.resolve(record);
    },
    setFeeSettings(
      tenantId: string,
      provider: string,
      environment: PaymentEnvironment,
      feeSettings: FeeSettings,
    ) {
      const index = indexOf(tenantId, provider, environment);
      if (index < 0) return Promise.reject(new Error('integração não encontrada'));
      const updated = { ...rows[index]!, feeSettings };
      rows[index] = updated;
      return Promise.resolve(updated);
    },
    find(tenantId: string, provider: string, environment: PaymentEnvironment) {
      const index = indexOf(tenantId, provider, environment);
      return Promise.resolve(index >= 0 ? rows[index]! : null);
    },
    list(tenantId: string) {
      return Promise.resolve(rows.filter((r) => r.tenantId === tenantId));
    },
    findByWebhookToken(tenantId: string, token: string) {
      return Promise.resolve(
        rows.find((r) => r.tenantId === tenantId && r.webhookToken === token) ?? null,
      );
    },
    remove(tenantId: string, provider: string, environment: PaymentEnvironment) {
      const index = indexOf(tenantId, provider, environment);
      if (index >= 0) rows.splice(index, 1);
      return Promise.resolve();
    },
  };
}

export function inMemoryPaymentCharges(): PaymentChargeRepository {
  const rows: (PaymentChargeRecord & { tenantId: string })[] = [];
  let seq = 0;

  const patch = (chargeId: string, data: Partial<PaymentChargeRecord>) => {
    const index = rows.findIndex((r) => r.id === chargeId);
    if (index < 0) return Promise.reject(new Error('cobrança não encontrada'));
    const updated = { ...rows[index]!, ...data };
    rows[index] = updated;
    return Promise.resolve(updated);
  };

  return {
    create(charge: NewPaymentCharge) {
      seq += 1;
      const record = {
        id: `dev-charge-${seq}`,
        tenantId: charge.tenantId,
        bookingId: charge.bookingId,
        provider: charge.provider,
        environment: charge.environment,
        externalId: charge.externalId,
        installmentExternalId: charge.installmentExternalId,
        amountCents: charge.amountCents,
        netAmountCents: charge.netAmountCents,
        installments: charge.installments,
        billingType: charge.billingType,
        dueDate: charge.dueDate,
        status: charge.status,
        invoiceUrl: charge.invoiceUrl,
        bookingPaymentId: null,
        paidAt: null,
        createdAt: new Date(),
        settledGrossCents: null,
        settledNetCents: null,
        awaitingCreditCents: null,
        anticipationFeeCents: null,
        paidInstallments: null,
        creditedInstallments: null,
        nextCreditDate: null,
        reconciledAt: null,
      };
      rows.push(record);
      return Promise.resolve(record);
    },
    findByExternalId(
      tenantId: string,
      provider: string,
      externalId: string,
      installmentExternalId?: string | null,
    ) {
      return Promise.resolve(
        rows.find(
          (r) =>
            r.tenantId === tenantId &&
            r.provider === provider &&
            (r.externalId === externalId ||
              (!!installmentExternalId && r.installmentExternalId === installmentExternalId)),
        ) ?? null,
      );
    },
    findById(tenantId: string, chargeId: string) {
      return Promise.resolve(
        rows.find((r) => r.tenantId === tenantId && r.id === chargeId) ?? null,
      );
    },
    saveSettlement(_tenantId: string, chargeId: string, settlement: ChargeSettlement) {
      const { installmentExternalId, ...rest } = settlement;
      return patch(chargeId, {
        ...rest,
        ...(installmentExternalId ? { installmentExternalId } : {}),
      });
    },
    listRecent(tenantId: string, limit: number) {
      return Promise.resolve(
        rows
          .filter((r) => r.tenantId === tenantId)
          .reverse()
          .slice(0, limit),
      );
    },
    listByBookings(tenantId: string, bookingIds: readonly string[]) {
      const wanted = new Set(bookingIds);
      return Promise.resolve(
        rows.filter((r) => r.tenantId === tenantId && wanted.has(r.bookingId)),
      );
    },
    listByBooking(tenantId: string, bookingId: string) {
      return Promise.resolve(
        rows.filter((r) => r.tenantId === tenantId && r.bookingId === bookingId),
      );
    },
    markSettled(_tenantId: string, chargeId: string, bookingPaymentId: string, paidAt: Date) {
      return patch(chargeId, { bookingPaymentId, paidAt, status: 'received' });
    },
    setStatus(_tenantId: string, chargeId: string, status: AsaasChargeStatus) {
      return patch(chargeId, { status });
    },
  };
}
