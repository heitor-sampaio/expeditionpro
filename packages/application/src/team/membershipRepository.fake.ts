import type { TeamRole } from '../context.js';
import type { MembershipRecord, MembershipRepository } from './membershipRepository.js';

export function fakeMembershipRepository(
  seed: readonly (MembershipRecord & { tenantId: string })[] = [],
): MembershipRepository & { rows: (MembershipRecord & { tenantId: string })[] } {
  const rows = [...seed];
  return {
    rows,
    findByUser(tenantId: string, userId: string) {
      return Promise.resolve(
        rows.find((r) => r.tenantId === tenantId && r.userId === userId) ?? null,
      );
    },
    list(tenantId: string) {
      return Promise.resolve(rows.filter((r) => r.tenantId === tenantId));
    },
    grant(tenantId: string, userId: string, email: string | null, role: TeamRole) {
      const existente = rows.findIndex((r) => r.tenantId === tenantId && r.userId === userId);
      const record = {
        tenantId,
        userId,
        email,
        role,
        createdAt: existente >= 0 ? rows[existente]!.createdAt : new Date('2026-01-01T00:00:00Z'),
      };
      if (existente >= 0) rows[existente] = record;
      else rows.push(record);
      return Promise.resolve(record);
    },
    revoke(tenantId: string, userId: string) {
      const i = rows.findIndex((r) => r.tenantId === tenantId && r.userId === userId);
      if (i < 0) return Promise.resolve(false);
      rows.splice(i, 1);
      return Promise.resolve(true);
    },
  };
}
