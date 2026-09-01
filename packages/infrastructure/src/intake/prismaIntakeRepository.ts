import { createHash, randomBytes } from 'node:crypto';
import type {
  ApiKeyRecord,
  ApiKeyRepository,
  CreatedApiKey,
  IntakeAllocation,
  IntakeEventRecord,
  IntakeForAllocation,
  IntakeQueueItem,
  IntakeRepository,
  NewApiKey,
  NewIntakeEvent,
  VerifiedApiKey,
  PortalRequestRecord,
} from '@expedition/application';
import { toQueueItem } from '@expedition/application';
import type { MappedIntake } from '@expedition/domain';
import type { IntakeEvent as PrismaIntake } from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma/client.js';
import { tenantClient } from '../prisma/tenantClient.js';

/**
 * Implementação Prisma do webhook. A verificação da API key NÃO passa pela extension
 * de tenant — é ela que resolve o tenant. Guardamos só o hash SHA-256; a comparação é
 * por hash + slug + escopo + validade, numa consulta (§3.9, IN-22).
 */
export function prismaApiKeyRepository(base: PrismaClient): ApiKeyRepository {
  return {
    async verify(
      token: string,
      tenantSlug: string,
      requiredScope: string,
    ): Promise<VerifiedApiKey | null> {
      const keyHash = sha256(token);
      const key = await base.apiKey.findFirst({
        where: {
          keyHash,
          revokedAt: null,
          scopes: { has: requiredScope },
          tenant: { slug: tenantSlug },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { id: true, tenantId: true },
      });
      return key ? { keyId: key.id, tenantId: key.tenantId } : null;
    },

    async touch(keyId: string): Promise<void> {
      await base.apiKey.update({
        where: { id: keyId },
        data: { lastUsedAt: new Date(), useCount: { increment: 1 } },
      });
    },

    async create(key: NewApiKey): Promise<CreatedApiKey> {
      const tenant = await base.tenant.findUnique({ where: { id: key.tenantId } });
      const marker = tenant?.slug ?? 'x';
      const prefix = `epk_${key.environment}_${marker}_`;
      const token = `${prefix}${randomBytes(16).toString('hex')}`;
      const row = await tenantClient(base, key.tenantId).apiKey.create({
        data: {
          tenantId: key.tenantId,
          name: key.name,
          prefix,
          keyHash: sha256(token),
          scopes: [...key.scopes],
        },
      });
      return { token, record: toApiKeyRecord(row) };
    },

    async list(tenantId: string): Promise<ApiKeyRecord[]> {
      const rows = await tenantClient(base, tenantId).apiKey.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toApiKeyRecord);
    },

    async revoke(tenantId: string, keyId: string, revokedBy: string): Promise<boolean> {
      const result = await tenantClient(base, tenantId).apiKey.updateMany({
        where: { id: keyId, revokedAt: null },
        data: { revokedAt: new Date(), revokedBy },
      });
      return result.count > 0;
    },
  };
}

function toApiKeyRecord(row: {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  useCount: number;
  revokedAt: Date | null;
}): ApiKeyRecord {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes,
    lastUsedAt: row.lastUsedAt,
    useCount: row.useCount,
    revokedAt: row.revokedAt,
  };
}

export function prismaIntakeRepository(base: PrismaClient): IntakeRepository {
  return {
    async findByExternalId(
      tenantId: string,
      source: string,
      externalId: string,
    ): Promise<IntakeEventRecord | null> {
      const row = await tenantClient(base, tenantId).intakeEvent.findFirst({
        where: { source, externalId },
      });
      return row ? toRecord(row) : null;
    },

    async store(event: NewIntakeEvent): Promise<IntakeEventRecord> {
      const row = await tenantClient(base, event.tenantId).intakeEvent.create({
        data: {
          tenantId: event.tenantId,
          source: event.source,
          externalId: event.externalId,
          payload: event.payload as object,
          normalized: event.normalized as object,
          formId: event.formId,
          itineraryId: event.itineraryId,
          submittedAt: event.submittedAt ? new Date(event.submittedAt) : null,
          status: event.status,
          error: event.error,
          isTest: event.isTest,
        },
      });
      return toRecord(row);
    },

    async listQueue(tenantId: string): Promise<IntakeQueueItem[]> {
      const rows = await tenantClient(base, tenantId).intakeEvent.findMany({
        where: { status: { notIn: ['allocated', 'discarded'] } },
        orderBy: { receivedAt: 'asc' },
      });
      return rows.map((row) =>
        toQueueItem(
          {
            id: row.id,
            externalId: row.externalId,
            formId: row.formId,
            status: row.status,
            error: row.error,
            itineraryId: row.itineraryId,
            source: row.source,
            payload: row.payload,
          },
          row.normalized as unknown as MappedIntake | null,
          row.receivedAt,
        ),
      );
    },

    async listPendingRequestsByGroup(tenantId: string, groupId: string): Promise<{ id: string }[]> {
      const rows = await tenantClient(base, tenantId).intakeEvent.findMany({
        where: {
          status: 'needs_allocation',
          payload: { path: ['groupId'], equals: groupId },
        },
        select: { id: true },
      });
      return rows.map((row) => ({ id: row.id }));
    },

    async listPortalRequestsByHead(
      tenantId: string,
      headCustomerId: string,
    ): Promise<PortalRequestRecord[]> {
      const rows = await tenantClient(base, tenantId).intakeEvent.findMany({
        where: {
          status: 'needs_allocation',
          source: 'portal',
          payload: { path: ['headCustomerId'], equals: headCustomerId },
        },
        orderBy: { receivedAt: 'desc' },
      });
      return rows.map((row) => {
        const payload = row.payload as { groupId?: string; participantCustomerIds?: string[] };
        return {
          id: row.id,
          groupId: payload.groupId ?? '',
          participantCount: (payload.participantCustomerIds ?? []).length,
          requestedAt: row.receivedAt.toISOString(),
        };
      });
    },

    async findForAllocation(
      tenantId: string,
      intakeId: string,
    ): Promise<IntakeForAllocation | null> {
      const row = await tenantClient(base, tenantId).intakeEvent.findUnique({
        where: { id: intakeId },
      });
      if (!row) return null;
      return {
        id: row.id,
        status: row.status,
        normalized: row.normalized as unknown as MappedIntake,
        source: row.source,
        payload: row.payload,
      };
    },

    async markAllocated(
      tenantId: string,
      intakeId: string,
      allocation: IntakeAllocation,
    ): Promise<void> {
      await tenantClient(base, tenantId).intakeEvent.update({
        where: { id: intakeId },
        data: {
          status: 'allocated',
          allocatedGroupId: allocation.groupId,
          bookingId: allocation.bookingId,
          allocatedBy: allocation.allocatedBy,
          allocatedAt: allocation.allocatedAt,
        },
      });
    },

    async markDiscarded(tenantId: string, intakeId: string, reason: string): Promise<void> {
      await tenantClient(base, tenantId).intakeEvent.update({
        where: { id: intakeId },
        data: { status: 'discarded', discardedReason: reason },
      });
    },

    async findForReprocess(
      tenantId: string,
      intakeId: string,
    ): Promise<{ id: string; status: string; source: string; payload: unknown } | null> {
      const row = await tenantClient(base, tenantId).intakeEvent.findUnique({
        where: { id: intakeId },
        select: { id: true, status: true, source: true, payload: true },
      });
      return row
        ? { id: row.id, status: row.status, source: row.source, payload: row.payload }
        : null;
    },

    async markReprocessed(
      tenantId: string,
      intakeId: string,
      result: { normalized: unknown; formId: string | null; submittedAt: string | null },
    ): Promise<void> {
      await tenantClient(base, tenantId).intakeEvent.update({
        where: { id: intakeId },
        data: {
          status: 'needs_allocation',
          error: null,
          normalized: result.normalized as object,
          formId: result.formId,
          submittedAt: result.submittedAt ? new Date(result.submittedAt) : null,
        },
      });
    },

    async markError(tenantId: string, intakeId: string, error: string): Promise<void> {
      await tenantClient(base, tenantId).intakeEvent.update({
        where: { id: intakeId },
        data: { status: 'error', error },
      });
    },
  };
}

function toRecord(row: PrismaIntake): IntakeEventRecord {
  return {
    id: row.id,
    source: row.source,
    externalId: row.externalId,
    formId: row.formId,
    status: row.status,
    error: row.error,
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
