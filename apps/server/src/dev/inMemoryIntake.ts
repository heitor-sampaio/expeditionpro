import type { MappedIntake } from '@expedition/domain';
import { toQueueItem } from '@expedition/application';
import type {
  ApiKeyRecord,
  ApiKeyRepository,
  IntakeEventRecord,
  IntakeRepository,
  NewApiKey,
  NewIntakeEvent,
  VerifiedApiKey,
} from '@expedition/application';

export interface DevApiKey {
  readonly token: string;
  readonly tenantSlug: string;
  readonly tenantId: string;
  readonly keyId: string;
  readonly scopes: readonly string[];
}

/** API keys em memória — SÓ para dev sem banco e testes de rota. */
export function inMemoryApiKeys(keys: DevApiKey[]): ApiKeyRepository {
  const records: ApiKeyRecord[] = [];
  let seq = 0;
  return {
    verify(
      token: string,
      tenantSlug: string,
      requiredScope: string,
    ): Promise<VerifiedApiKey | null> {
      const key = keys.find(
        (k) => k.token === token && k.tenantSlug === tenantSlug && k.scopes.includes(requiredScope),
      );
      return Promise.resolve(key ? { keyId: key.keyId, tenantId: key.tenantId } : null);
    },
    touch() {
      return Promise.resolve();
    },
    create(key: NewApiKey) {
      seq += 1;
      const prefix = `epk_${key.environment}_dev_`;
      const record: ApiKeyRecord = {
        id: `dev-apikey-${seq}`,
        name: key.name,
        prefix,
        scopes: key.scopes,
        lastUsedAt: null,
        useCount: 0,
        revokedAt: null,
      };
      records.push(record);
      return Promise.resolve({ token: `${prefix}devsecret${seq}`, record });
    },
    list() {
      return Promise.resolve(records);
    },
    revoke(_tenantId: string, keyId: string) {
      const i = records.findIndex((r) => r.id === keyId);
      if (i === -1) return Promise.resolve(false);
      records[i] = { ...records[i]!, revokedAt: new Date() };
      return Promise.resolve(true);
    },
  };
}

/** Fila de intake em memória — SÓ para dev sem banco e testes de rota. */
export function inMemoryIntake(): IntakeRepository {
  const rows: (IntakeEventRecord & {
    tenantId: string;
    normalized: unknown;
    payload: unknown;
    itineraryId: string | null;
  })[] = [];
  let seq = 0;
  const patch = (
    id: string,
    next: Partial<{
      status: string;
      error: string | null;
      normalized: unknown;
      formId: string | null;
    }>,
  ) => {
    const i = rows.findIndex((r) => r.id === id);
    if (i !== -1) rows[i] = { ...rows[i]!, ...next };
  };
  return {
    findByExternalId(tenantId: string, source: string, externalId: string) {
      return Promise.resolve(
        rows.find(
          (r) => r.tenantId === tenantId && r.source === source && r.externalId === externalId,
        ) ?? null,
      );
    },
    store(event: NewIntakeEvent) {
      seq += 1;
      const record = {
        id: `dev-intake-${seq}`,
        tenantId: event.tenantId,
        source: event.source,
        externalId: event.externalId,
        formId: event.formId,
        status: event.status,
        error: event.error,
        normalized: event.normalized,
        payload: event.payload,
        itineraryId: event.itineraryId,
      };
      rows.push(record);
      return Promise.resolve(record);
    },
    listPendingRequestsByGroup(tenantId: string, groupId: string) {
      return Promise.resolve(
        rows
          .filter(
            (r) =>
              r.tenantId === tenantId &&
              r.status === 'needs_allocation' &&
              (r.payload as { groupId?: string } | null)?.groupId === groupId,
          )
          .map((r) => ({ id: r.id })),
      );
    },
    listPortalRequestsByHead(tenantId: string, headCustomerId: string) {
      return Promise.resolve(
        rows
          .filter(
            (r) =>
              r.tenantId === tenantId &&
              r.status === 'needs_allocation' &&
              (r.payload as { headCustomerId?: string } | null)?.headCustomerId === headCustomerId,
          )
          .map((r) => {
            const payload = r.payload as { groupId?: string; participantCustomerIds?: string[] };
            return {
              id: r.id,
              groupId: payload.groupId ?? '',
              participantCount: (payload.participantCustomerIds ?? []).length,
              requestedAt: new Date().toISOString(),
            };
          }),
      );
    },
    listQueue(tenantId: string) {
      return Promise.resolve(
        rows
          .filter(
            (r) => r.tenantId === tenantId && r.status !== 'allocated' && r.status !== 'discarded',
          )
          .map((r) =>
            toQueueItem(
              {
                id: r.id,
                externalId: r.externalId,
                formId: r.formId,
                status: r.status,
                error: r.error,
                itineraryId: r.itineraryId,
                source: r.source,
                payload: r.payload,
              },
              (r.normalized as MappedIntake | null) ?? null,
              new Date(),
            ),
          ),
      );
    },
    findForAllocation(tenantId: string, intakeId: string) {
      const row = rows.find((r) => r.tenantId === tenantId && r.id === intakeId);
      return Promise.resolve(
        row
          ? {
              id: row.id,
              status: row.status,
              normalized: row.normalized as MappedIntake,
              source: row.source,
              payload: row.payload,
            }
          : null,
      );
    },
    markAllocated(tenantId: string, intakeId: string) {
      void tenantId;
      patch(intakeId, { status: 'allocated' });
      return Promise.resolve();
    },
    markDiscarded(tenantId: string, intakeId: string) {
      void tenantId;
      patch(intakeId, { status: 'discarded' });
      return Promise.resolve();
    },
    findForReprocess(tenantId: string, intakeId: string) {
      const row = rows.find((r) => r.tenantId === tenantId && r.id === intakeId);
      return Promise.resolve(
        row ? { id: row.id, status: row.status, source: row.source, payload: row.payload } : null,
      );
    },
    markReprocessed(
      tenantId: string,
      intakeId: string,
      result: { normalized: unknown; formId: string | null; submittedAt: string | null },
    ) {
      void tenantId;
      void result.submittedAt;
      patch(intakeId, {
        status: 'needs_allocation',
        error: null,
        normalized: result.normalized,
        formId: result.formId,
      });
      return Promise.resolve();
    },
    markError(tenantId: string, intakeId: string, error: string) {
      void tenantId;
      patch(intakeId, { status: 'error', error });
      return Promise.resolve();
    },
  };
}
