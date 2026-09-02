import type { MembershipRecord, MembershipRepository, TeamRole } from '@expedition/application';

/**
 * Acesso ao sistema em memória — SÓ para dev e testes de rota (SEC-17).
 *
 * Sem semente: em dev a verificação de acesso não roda (o stub de auth fica de fora dela),
 * e nos testes de rota cada arquivo semeia o que precisa. Uma semente aqui seria estado
 * escondido que o teste não pediu.
 */
export function inMemoryMemberships(
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
      const i = rows.findIndex((r) => r.tenantId === tenantId && r.userId === userId);
      const record = {
        tenantId,
        userId,
        email,
        role,
        createdAt: i >= 0 ? rows[i]!.createdAt : new Date('2026-01-01T00:00:00Z'),
      };
      if (i >= 0) rows[i] = record;
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
