import { createHash } from 'node:crypto';
import { randomBytes } from 'node:crypto';
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
import {
  cents,
  type AsaasChargeStatus,
  type FeeSettings,
  type LocalDate,
} from '@expedition/domain';
import type {
  PaymentCharge as PrismaCharge,
  PaymentIntegration as PrismaIntegration,
} from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma/client.js';
import { tenantClient } from '../prisma/tenantClient.js';
import type { TokenCipher } from './tokenCipher.js';

/**
 * PG-01/PG-02 — persistência do gateway. A **cifra vive aqui**: a aplicação lida com o
 * token em claro (precisa dele para chamar o provedor) e nunca soube que existe cifra;
 * o banco nunca viu a chave. É a fronteira certa para esse segredo.
 */

export function prismaPaymentIntegrationRepository(
  base: PrismaClient,
  cipher: TokenCipher,
): PaymentIntegrationRepository {
  const toRecord = (row: PrismaIntegration): PaymentIntegrationRecord => ({
    id: row.id,
    provider: row.provider,
    environment: row.environment as PaymentEnvironment,
    accessToken: cipher.decrypt(row.accessToken),
    webhookTokenHash: row.webhookTokenHash,
    accountName: row.accountName,
    feeSettings: (row.feeSettings as FeeSettings | null) ?? {},
    active: row.active,
    connectedAt: row.connectedAt,
    lastCheckedAt: row.lastCheckedAt,
  });

  return {
    async upsert(integration: NewPaymentIntegration): Promise<PaymentIntegrationRecord> {
      const client = tenantClient(base, integration.tenantId);
      /*
       * SEC-01 — o hash do webhook só entra no `data` quando há segredo novo. Numa
       * reconexão o caso de uso não manda segredo, e omitir aqui é o que **preserva** o
       * hash existente: mudar o segredo obrigaria a reconfigurar o webhook no ASAAS, e a
       * confirmação de pagamento pararia de chegar em silêncio.
       */
      const data = {
        accessToken: cipher.encrypt(integration.accessToken),
        ...(integration.webhookToken === undefined
          ? {}
          : { webhookTokenHash: sha256(integration.webhookToken) }),
        accountName: integration.accountName,
        active: true,
        connectedBy: integration.connectedBy,
        connectedAt: integration.connectedAt,
        lastCheckedAt: integration.connectedAt,
      };
      const existing = await client.paymentIntegration.findFirst({
        where: { provider: integration.provider, environment: integration.environment },
        select: { id: true },
      });
      if (!existing && integration.webhookToken === undefined) {
        // Conexão nova sem segredo seria linha sem hash — e o webhook não teria como se
        // provar. O caso de uso só omite o segredo quando a linha já existe.
        throw new Error('upsert: conexão nova exige webhookToken');
      }

      const row = existing
        ? await client.paymentIntegration.update({ where: { id: existing.id }, data })
        : await client.paymentIntegration.create({
            data: {
              tenantId: integration.tenantId,
              provider: integration.provider,
              environment: integration.environment,
              ...data,
              webhookTokenHash: sha256(integration.webhookToken!),
            },
          });
      return toRecord(row);
    },

    async setFeeSettings(
      tenantId: string,
      provider: string,
      environment: PaymentEnvironment,
      feeSettings: FeeSettings,
    ): Promise<PaymentIntegrationRecord> {
      const client = tenantClient(base, tenantId);
      const existing = await client.paymentIntegration.findFirst({
        where: { provider, environment },
        select: { id: true },
      });
      if (!existing) throw new Error('integração não encontrada');
      const row = await client.paymentIntegration.update({
        where: { id: existing.id },
        data: { feeSettings: feeSettings as object },
      });
      return toRecord(row);
    },

    async find(
      tenantId: string,
      provider: string,
      environment: PaymentEnvironment,
    ): Promise<PaymentIntegrationRecord | null> {
      const row = await tenantClient(base, tenantId).paymentIntegration.findFirst({
        where: { provider, environment },
      });
      return row ? toRecord(row) : null;
    },

    async list(tenantId: string): Promise<PaymentIntegrationRecord[]> {
      const rows = await tenantClient(base, tenantId).paymentIntegration.findMany({
        orderBy: { environment: 'asc' },
      });
      return rows.map(toRecord);
    },

    async findByWebhookToken(
      tenantId: string,
      token: string,
    ): Promise<PaymentIntegrationRecord | null> {
      /*
       * Busca por hash, como a API key de intake: o segredo apresentado é hasheado e o
       * lookup vai por índice. Não há comparação byte a byte de segredo em memória.
       */
      const row = await tenantClient(base, tenantId).paymentIntegration.findFirst({
        where: { webhookTokenHash: sha256(token), active: true },
      });
      return row ? toRecord(row) : null;
    },

    async remove(
      tenantId: string,
      provider: string,
      environment: PaymentEnvironment,
    ): Promise<void> {
      await tenantClient(base, tenantId).paymentIntegration.deleteMany({
        where: { provider, environment },
      });
    },
  };
}

export function prismaPaymentChargeRepository(base: PrismaClient): PaymentChargeRepository {
  return {
    async create(charge: NewPaymentCharge): Promise<PaymentChargeRecord> {
      const row = await tenantClient(base, charge.tenantId).paymentCharge.create({
        data: {
          tenantId: charge.tenantId,
          bookingId: charge.bookingId,
          provider: charge.provider,
          environment: charge.environment,
          externalId: charge.externalId,
          installmentExternalId: charge.installmentExternalId,
          amountCents: BigInt(charge.amountCents),
          netAmountCents: BigInt(charge.netAmountCents),
          installments: charge.installments,
          billingType: charge.billingType,
          dueDate: localDateToDate(charge.dueDate),
          status: charge.status,
          invoiceUrl: charge.invoiceUrl,
          createdBy: charge.createdBy,
        },
      });
      return toChargeRecord(row);
    },

    async findByExternalId(
      tenantId: string,
      provider: string,
      externalId: string,
      installmentExternalId?: string | null,
    ): Promise<PaymentChargeRecord | null> {
      const row = await tenantClient(base, tenantId).paymentCharge.findFirst({
        where: {
          provider,
          OR: [{ externalId }, ...(installmentExternalId ? [{ installmentExternalId }] : [])],
        },
      });
      return row ? toChargeRecord(row) : null;
    },

    async findById(tenantId: string, chargeId: string): Promise<PaymentChargeRecord | null> {
      const row = await tenantClient(base, tenantId).paymentCharge.findUnique({
        where: { id: chargeId },
      });
      return row ? toChargeRecord(row) : null;
    },

    async saveSettlement(
      tenantId: string,
      chargeId: string,
      settlement: ChargeSettlement,
    ): Promise<PaymentChargeRecord> {
      const row = await tenantClient(base, tenantId).paymentCharge.update({
        where: { id: chargeId },
        data: {
          settledGrossCents: BigInt(settlement.settledGrossCents),
          settledNetCents: BigInt(settlement.settledNetCents),
          awaitingCreditCents: BigInt(settlement.awaitingCreditCents),
          anticipationFeeCents: BigInt(settlement.anticipationFeeCents),
          paidInstallments: settlement.paidInstallments,
          creditedInstallments: settlement.creditedInstallments,
          nextCreditDate: settlement.nextCreditDate
            ? localDateToDate(settlement.nextCreditDate)
            : null,
          reconciledAt: settlement.reconciledAt,
          ...(settlement.installmentExternalId
            ? { installmentExternalId: settlement.installmentExternalId }
            : {}),
        },
      });
      return toChargeRecord(row);
    },

    async listRecent(tenantId: string, limit: number): Promise<PaymentChargeRecord[]> {
      const rows = await tenantClient(base, tenantId).paymentCharge.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return rows.map(toChargeRecord);
    },

    async listByBookings(
      tenantId: string,
      bookingIds: readonly string[],
    ): Promise<PaymentChargeRecord[]> {
      if (bookingIds.length === 0) return [];
      const rows = await tenantClient(base, tenantId).paymentCharge.findMany({
        where: { bookingId: { in: [...bookingIds] } },
      });
      return rows.map(toChargeRecord);
    },

    async listByBooking(tenantId: string, bookingId: string): Promise<PaymentChargeRecord[]> {
      const rows = await tenantClient(base, tenantId).paymentCharge.findMany({
        where: { bookingId },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toChargeRecord);
    },

    async markSettled(
      tenantId: string,
      chargeId: string,
      bookingPaymentId: string,
      paidAt: Date,
    ): Promise<PaymentChargeRecord> {
      const row = await tenantClient(base, tenantId).paymentCharge.update({
        where: { id: chargeId },
        data: { bookingPaymentId, paidAt, status: 'received' },
      });
      return toChargeRecord(row);
    },

    async setStatus(
      tenantId: string,
      chargeId: string,
      status: AsaasChargeStatus,
    ): Promise<PaymentChargeRecord> {
      const row = await tenantClient(base, tenantId).paymentCharge.update({
        where: { id: chargeId },
        data: { status },
      });
      return toChargeRecord(row);
    },
  };
}

/** Segredo do webhook: aleatório do sistema operacional, nunca `Math.random`. */
export function newWebhookSecret(): string {
  return `whk_${randomBytes(24).toString('base64url')}`;
}

function toChargeRecord(row: PrismaCharge): PaymentChargeRecord {
  return {
    id: row.id,
    bookingId: row.bookingId,
    provider: row.provider,
    environment: row.environment as PaymentEnvironment,
    externalId: row.externalId,
    installmentExternalId: row.installmentExternalId,
    amountCents: cents(Number(row.amountCents)),
    netAmountCents: cents(Number(row.netAmountCents ?? row.amountCents)),
    installments: row.installments,
    billingType: row.billingType,
    dueDate: dateToLocalDate(row.dueDate),
    status: row.status as AsaasChargeStatus,
    invoiceUrl: row.invoiceUrl,
    bookingPaymentId: row.bookingPaymentId,
    paidAt: row.paidAt,
    createdAt: row.createdAt,
    settledGrossCents: row.settledGrossCents === null ? null : Number(row.settledGrossCents),
    settledNetCents: row.settledNetCents === null ? null : Number(row.settledNetCents),
    awaitingCreditCents: row.awaitingCreditCents === null ? null : Number(row.awaitingCreditCents),
    anticipationFeeCents:
      row.anticipationFeeCents === null ? null : Number(row.anticipationFeeCents),
    paidInstallments: row.paidInstallments,
    creditedInstallments: row.creditedInstallments,
    nextCreditDate: row.nextCreditDate ? dateToLocalDate(row.nextCreditDate) : null,
    reconciledAt: row.reconciledAt,
  };
}

function localDateToDate(date: LocalDate): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

function dateToLocalDate(date: Date): LocalDate {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/** Mesmo hash que a API key de intake usa — uma definição só no projeto. */
function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
