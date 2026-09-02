import { describe, it, expect } from 'vitest';
import { ForbiddenError } from './errors.js';
import { searchCustomers } from './customers/searchCustomers.js';
import { registerCustomer } from './customers/registerCustomer.js';
import { mergeCustomers } from './customers/mergeCustomers.js';
import { moveToResponsible } from './customers/moveToResponsible.js';
import { promoteToResponsible } from './customers/promoteToResponsible.js';
import { createScheduleEvent } from './schedule/createScheduleEvent.js';
import { updateScheduleEvent } from './schedule/updateScheduleEvent.js';
import { deleteScheduleEvent } from './schedule/deleteScheduleEvent.js';
import { allocateBooking } from './bookings/allocateBooking.js';
import { allocateManualBooking } from './bookings/allocateManualBooking.js';
import { getGroupBoard } from './bookings/getGroupBoard.js';
import { updatePaymentFees } from './payments/updatePaymentFees.js';
import { disconnectPaymentProvider } from './payments/disconnectPaymentProvider.js';
import { getTermEditorState } from './documents/getTermEditorState.js';
import type { RequestContext } from './context.js';

/**
 * SEC-01 — a regra de audiência do produto, executável.
 *
 * O cliente pode: ver a agenda (só ver), ver as expedições ativas, se inscrever, postar,
 * curtir e comentar na comunidade, apagar o **próprio** post ou comentário, remover a
 * **própria** curtida, e editar os próprios dados. Nada além disso.
 *
 * O que está aqui é o "nada além disso": procurar, criar, editar ou apagar outro cliente,
 * roteiro, saída ou qualquer lançamento. O servidor usa Prisma com `BYPASSRLS`, então a
 * policy do banco não cobre esta via — a guarda tem de estar no caso de uso.
 *
 * `integration` e `system` **não** são barrados: webhook do site e job interno agem por
 * conta do tenant. A regra do dono é sobre o cliente, e a guarda é exatamente ela.
 *
 * `registerCompanion` e `saveVehicle` **não** estão aqui: o portal chega neles por
 * `registerFamilyCompanion` e `savePortalVehicle`, que escopam à própria família (PC-06,
 * PC-08). Guarda no caso de uso compartilhado quebraria o caminho legítimo do cliente —
 * a suíte pegou isso na hora. A guarda deles é na rota de back-office, testada em
 * `apps/server/src/routes/customers.test.ts` e `vehicles.test.ts`.
 */

const cliente: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'customer', userId: 'u2', customerId: 'c1' },
};

/*
 * Deps vazias de propósito: se a guarda estiver no lugar certo, ela dispara **antes** de
 * qualquer I/O. Um `TypeError` de repositório indefinido aqui significaria guarda tardia,
 * depois de o caso de uso já ter tocado o banco.
 */
const semDeps = {} as never;

const casos: readonly [string, () => Promise<unknown>][] = [
  ['searchCustomers', () => searchCustomers(semDeps, cliente, semDeps)],
  ['registerCustomer', () => registerCustomer(semDeps, cliente, semDeps)],
  ['mergeCustomers', () => mergeCustomers(semDeps, cliente, semDeps)],
  ['moveToResponsible', () => moveToResponsible(semDeps, cliente, semDeps)],
  ['promoteToResponsible', () => promoteToResponsible(semDeps, cliente, semDeps)],
  ['createScheduleEvent', () => createScheduleEvent(semDeps, cliente, semDeps)],
  ['updateScheduleEvent', () => updateScheduleEvent(semDeps, cliente, semDeps)],
  ['deleteScheduleEvent', () => deleteScheduleEvent(semDeps, cliente, semDeps)],
  ['allocateBooking', () => allocateBooking(semDeps, cliente, semDeps)],
  ['allocateManualBooking', () => allocateManualBooking(semDeps, cliente, semDeps)],
  ['getGroupBoard', () => getGroupBoard(semDeps, cliente, semDeps)],
  ['updatePaymentFees', () => updatePaymentFees(semDeps, cliente, semDeps)],
  ['disconnectPaymentProvider', () => disconnectPaymentProvider(semDeps, cliente, semDeps)],
  ['getTermEditorState', () => getTermEditorState(semDeps, cliente)],
];

describe('SEC-01: o cliente não alcança o back-office', () => {
  it.each(casos)('%s recusa ator cliente antes de qualquer I/O', async (_nome, chamar) => {
    await expect(chamar()).rejects.toBeInstanceOf(ForbiddenError);
  });
});
