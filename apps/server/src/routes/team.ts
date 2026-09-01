import {
  decideIdentityChange,
  inviteTeamMember,
  listIdentityChangeRequests,
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
      const invited: InvitedUser = await inviteTeamMember({ authAdmin: deps.authAdmin }, ctx, {
        email: request.body.email,
        role: request.body.role,
      });
      return reply.status(201).send({ userId: invited.userId, actionLink: invited.actionLink });
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
