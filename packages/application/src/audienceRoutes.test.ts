import { describe, expect, it } from 'vitest';
import { ForbiddenError } from './errors.js';
import { listSuppliersForTeam } from './suppliers/listSuppliersForTeam.js';
import { listBookingPayments } from './payments/listBookingPayments.js';
import { listAgendaEvents } from './schedule/listAgendaEvents.js';
import type { RequestContext } from './context.js';

/**
 * SEC-01 — as três rotas que atalhavam o caso de uso.
 *
 * Todas liam o repositório **direto** da rota, e por isso não havia onde a guarda coubesse.
 * É o mesmo defeito que já tinha aparecido no catálogo de roteiros: guarda no caso de uso
 * não vale nada se a rota não passa por ele — e aqui nem caso de uso existia.
 *
 * O que estava aberto para um token de cliente:
 *   · `GET /v1/suppliers` — todos os fornecedores com documento inteiro e **chave PIX crua**;
 *   · `GET /v1/bookings/:id/payments` — o ledger de recebimentos de **qualquer** inscrição;
 *   · `GET /v1/schedule-events` — a agenda inteira, incluindo grupo `private` e não-`open`.
 *
 * O cliente enxerga agenda pelo `/v1/portal/expeditions`, que filtra `open` + `public` —
 * a regra do dono ("pode visualizar agenda e só visualizar") continua valendo por lá.
 */

const cliente: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'customer', userId: 'u2', customerId: 'c1' },
};

/*
 * Deps vazias: a guarda tem de disparar **antes** de qualquer I/O. Um `TypeError` de
 * repositório indefinido aqui significaria guarda tardia, depois de o banco ter sido lido.
 */
const semDeps = {} as never;

describe('SEC-01: as rotas que liam o repositório direto agora recusam o cliente', () => {
  it('não lista fornecedores — documento e chave PIX são da equipe', async () => {
    await expect(listSuppliersForTeam(semDeps, cliente)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('não lê o ledger de recebimentos de uma inscrição', async () => {
    await expect(listBookingPayments(semDeps, cliente, { bookingId: 'b1' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('não lê a agenda de back-office — grupo privado não é da audiência dele', async () => {
    await expect(listAgendaEvents(semDeps, cliente)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
