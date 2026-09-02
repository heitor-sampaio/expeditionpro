import {
  decideIdentityChange,
  inviteTeamMember,
  listIdentityChangeRequests,
  listTeamMembers,
  revokeTeamAccess,
} from '@expedition/application';
import { maskCpf, parseCpf, type LocalDate } from '@expedition/domain';
import { z } from 'zod';
import type { EnrichedIdentityRequest, InvitedUser } from '@expedition/application';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ServerDeps } from '../buildServer.js';

/**
 * Rotas de equipe (§3.7). Convite de membro (Admin API + app_metadata) e a fila de
 * aprovação de identidade (PC-07): a equipe lista os pendentes e decide (aprova aplica
 * a mudança; recusa arquiva). CPF sempre mascarado no DTO (SEC-04).
 */
export function registerTeamRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/v1/team/invitations',
    {
      schema: {
        body: z.object({
          email: z.string().email(),
          role: z.enum(['admin', 'operator', 'viewer']),
        }),
      },
    },
    async (request, reply) => {
      if (!deps.authAdmin) {
        return reply.status(503).send({ error: 'auth_admin_unavailable' });
      }
      const ctx = await deps.resolveContext(request);
      const invited: InvitedUser = await inviteTeamMember(
        { authAdmin: deps.authAdmin, audit: deps.audit, memberships: deps.memberships },
        ctx,
        {
          email: request.body.email,
          role: request.body.role,
        },
      );
      return reply.status(201).send({ userId: invited.userId, actionLink: invited.actionLink });
    },
  );

  /*
   * SEC-17 — quem tem acesso ao sistema.
   *
   * O DTO não devolve nada além do necessário para a tela decidir: e-mail, papel e desde
   * quando. O `userId` vai porque é a chave da remoção — é o id do login no Supabase, não
   * um dado pessoal, e sem ele a tela não teria como apontar quem remover.
   */
  typed.get('/v1/team/members', async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const membros = await listTeamMembers({ memberships: deps.memberships }, ctx);
    return reply.send(
      membros.map((m) => ({
        userId: m.userId,
        email: m.email,
        role: m.role,
        since: m.createdAt.toISOString().slice(0, 10),
      })),
    );
  });

  // SEC-17 — tira o acesso. Vale na requisição seguinte, não quando o token expirar.
  typed.delete(
    '/v1/team/members/:userId',
    { schema: { params: z.object({ userId: z.string().min(1) }) } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      await revokeTeamAccess({ memberships: deps.memberships, audit: deps.audit }, ctx, {
        userId: request.params.userId,
      });
      return reply.status(204).send();
    },
  );

  // PC-07 — fila de aprovação de identidade
  typed.get('/v1/team/identity-change-requests', async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const rows = await listIdentityChangeRequests(
      { customers: deps.customers, identityRequests: deps.identityRequests },
      ctx,
    );
    return reply.send(rows.map(identityRequestDto));
  });

  typed.post(
    '/v1/team/identity-change-requests/:id/decision',
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: z.object({ approve: z.boolean(), note: z.string().optional() }),
      },
    },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const decided = await decideIdentityChange(
        {
          customers: deps.customers,
          identityRequests: deps.identityRequests,
          audit: deps.audit,
          clock: deps.clock ?? (() => new Date()),
        },
        ctx,
        { requestId: request.params.id, approve: request.body.approve, note: request.body.note },
      );
      return reply.send({ id: decided.id, status: decided.status });
    },
  );
}

/** DTO da fila de identidade: mostra o de→para com CPFs mascarados (SEC-04). */
function identityRequestDto(row: EnrichedIdentityRequest) {
  return {
    id: row.request.id,
    customerId: row.request.customerId,
    customerName: row.customerName,
    reason: row.request.reason,
    current: {
      fullName: row.currentFullName,
      cpf: row.currentCpf ? maskCpf(parseCpf(row.currentCpf)) : null,
      birthDate: row.currentBirthDate ? isoDate(row.currentBirthDate) : null,
      email: row.currentEmail,
      phone: row.currentPhone,
    },
    requested: {
      fullName: row.request.fullName,
      cpf: row.request.cpf ? maskCpf(parseCpf(row.request.cpf)) : null,
      birthDate: row.request.birthDate ? isoDate(row.request.birthDate) : null,
      email: row.request.email,
      phone: row.request.phone,
    },
  };
}

function isoDate(date: LocalDate): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}
