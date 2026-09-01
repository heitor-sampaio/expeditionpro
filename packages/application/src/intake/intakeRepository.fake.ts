import type { MappedIntake } from '@expedition/domain';
import { toQueueItem } from './queueItem.js';
import type {
  ApiKeyRecord,
  ApiKeyRepository,
  IntakeEventRecord,
  IntakeRepository,
  NewApiKey,
  NewIntakeEvent,
  VerifiedApiKey,
} from './intakeRepository.js';

/** Chave semeada para o fake: casa por token + slug + escopo. */
export interface FakeApiKey {
  readonly token: string;
  readonly tenantSlug: string;
  readonly tenantId: string;
  readonly keyId: string;
  readonly scopes: readonly string[];
  readonly revoked?: boolean;
  readonly expired?: boolean;
}

export function fakeApiKeyRepository(keys: FakeApiKey[]): ApiKeyRepository & {
  touched: string[];
  created: { name: string; scopes: readonly string[] }[];
} {
  const touched: string[] = [];
  const created: { name: string; scopes: readonly string[] }[] = [];
  const records: ApiKeyRecord[] = [];
  let seq = 0;
  return {
    touched,
    created,
    verify(
      token: string,
      tenantSlug: string,
      requiredScope: string,
    ): Promise<VerifiedApiKey | null> {
      const key = keys.find(
        (k) =>
          k.token === token &&
          k.tenantSlug === tenantSlug &&
          k.scopes.includes(requiredScope) &&
          !k.revoked &&
          !k.expired,
      );
      return Promise.resolve(key ? { keyId: key.keyId, tenantId: key.tenantId } : null);
    },
    touch(keyId: string) {
      touched.push(keyId);
      return Promise.resolve();
    },
    create(key: NewApiKey) {
      seq += 1;
      created.push({ name: key.name, scopes: key.scopes });
      const prefix = `epk_${key.environment}_t_`;
      const record: ApiKeyRecord = {
        id: `apikey-${seq}`,
        name: key.name,
        prefix,
        scopes: key.scopes,
        lastUsedAt: null,
        useCount: 0,
        revokedAt: null,
      };
      records.push(record);
      return Promise.resolve({ token: `${prefix}secret${seq}`, record });
    },
    list() {
      return Promise.resolve(records);
    },
    revoke(_tenantId: string, keyId: string) {
      const i = records.findIndex((r) => r.id === keyId);
      if (i === -1) return Promise.resolve(false);
      records[i] = { ...records[i]!, revokedAt: new Date('2026-08-25T00:00:00Z') };
      return Promise.resolve(true);
    },
  };
}

type FakeRow = IntakeEventRecord & {
  tenantId: string;
  normalized: unknown;
  payload: unknown;
  itineraryId: string | null;
};

export function fakeIntakeRepository(): IntakeRepository & { rows: FakeRow[] } {
  const rows: FakeRow[] = [];
  let seq = 0;
  const set = (id: string, patch: Partial<FakeRow>) => {
    const i = rows.findIndex((r) => r.id === id);
    if (i !== -1) rows[i] = { ...rows[i]!, ...patch };
  };
  return {
    rows,
    findByExternalId(tenantId: string, source: string, externalId: string) {
      return Promise.resolve(
        rows.find(
          (r) => r.tenantId === tenantId && r.source === source && r.externalId === externalId,
        ) ?? null,
      );
    },
    store(event: NewIntakeEvent) {
      seq += 1;
      const record: FakeRow = {
        id: `intake-${seq}`,
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
          .map((r) => ({
            id: r.id,
            groupId: (r.payload as { groupId?: string }).groupId ?? '',
            participantCount: (
              (r.payload as { participantCustomerIds?: string[] }).participantCustomerIds ?? []
            ).length,
            requestedAt: new Date(0).toISOString(),
          })),
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
              new Date('2026-08-25T00:00:00Z'),
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
      set(intakeId, { status: 'allocated' });
      return Promise.resolve();
    },
    markDiscarded(tenantId: string, intakeId: string) {
      void tenantId;
      set(intakeId, { status: 'discarded' });
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
      set(intakeId, {
        status: 'needs_allocation',
        error: null,
        normalized: result.normalized,
        formId: result.formId,
      });
      return Promise.resolve();
    },
    markError(tenantId: string, intakeId: string, error: string) {
      void tenantId;
      set(intakeId, { status: 'error', error });
      return Promise.resolve();
    },
  };
}
