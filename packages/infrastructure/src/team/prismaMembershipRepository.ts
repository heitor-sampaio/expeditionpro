import type { MembershipRecord, MembershipRepository, TeamRole } from '@expedition/application';
import type { Membership as PrismaRow } from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma/client.js';
import { tenantClient } from '../prisma/tenantClient.js';

/**
 * SEC-17 — quem tem acesso ao sistema, lido do banco e não do token.
 *
 * `findByUser` é caminho quente: roda em toda requisição de equipe, e é o que faz tirar
 * o acesso valer no ato em vez de esperar o token expirar. O índice único
 * `(tenant_id, user_id)` atende a consulta inteira.
 */
export function prismaMembershipRepository(base: PrismaClient): MembershipRepository {
  return {
    async findByUser(tenantId: string, userId: string): Promise<MembershipRecord | null> {
      const row = await tenantClient(base, tenantId).membership.findFirst({ where: { userId } });
      return row ? toRecord(row) : null;
    },

    async list(tenantId: string): Promise<readonly MembershipRecord[]> {
      const rows = await tenantClient(base, tenantId).membership.findMany({
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toRecord);
    },

    async grant(
      tenantId: string,
      userId: string,
      email: string | null,
      role: TeamRole,
    ): Promise<MembershipRecord> {
      const row = await tenantClient(base, tenantId).membership.upsert({
        where: { tenantId_userId: { tenantId, userId } },
        create: { tenantId, userId, email, role },
        update: { email, role },
      });
      return toRecord(row);
    },

    async revoke(tenantId: string, userId: string): Promise<boolean> {
      const { count } = await tenantClient(base, tenantId).membership.deleteMany({
        where: { userId },
      });
      return count > 0;
    },
  };
}

function toRecord(row: PrismaRow): MembershipRecord {
  return {
    userId: row.userId,
    email: row.email,
    // O papel é texto no banco (mesma escolha do resto do schema); a borda o estreita.
    role: row.role as TeamRole,
    createdAt: row.createdAt,
  };
}
