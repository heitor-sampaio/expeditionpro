import { describe, expect, it } from 'vitest';
import { ForbiddenError } from './errors.js';
import { allocateBooking } from './bookings/allocateBooking.js';
import { allocateManualBooking } from './bookings/allocateManualBooking.js';
import { cancelBooking } from './bookings/cancelBooking.js';
import { markBookingInvoice } from './bookings/markBookingInvoice.js';
import { undoCheckIn } from './bookings/undoCheckIn.js';
import { createScheduleEvent } from './schedule/createScheduleEvent.js';
import { updateScheduleEvent } from './schedule/updateScheduleEvent.js';
import { deleteScheduleEvent } from './schedule/deleteScheduleEvent.js';
import { registerCustomer } from './customers/registerCustomer.js';
import { mergeCustomers } from './customers/mergeCustomers.js';
import { moveToResponsible } from './customers/moveToResponsible.js';
import { promoteToResponsible } from './customers/promoteToResponsible.js';
import { updateCustomer } from './customers/updateCustomer.js';
import { createItinerary } from './itineraries/createItinerary.js';
import { updateItinerary } from './itineraries/updateItinerary.js';
import { setItineraryPhotos } from './itineraries/setItineraryPhotos.js';
import { addItineraryPriceVersion } from './itineraries/addItineraryPriceVersion.js';
import { createSupplier } from './suppliers/createSupplier.js';
import { updateSupplier } from './suppliers/updateSupplier.js';
import { createSupplierCategory } from './suppliers/createSupplierCategory.js';
import { addSupplierExpense } from './suppliers/addSupplierExpense.js';
import { registerSupplierPayment } from './suppliers/registerSupplierPayment.js';
import { accrueCashback } from './cashback/accrueCashback.js';
import { expireCashback } from './cashback/expireCashback.js';
import { allocateFromQueue } from './intake/allocateFromQueue.js';
import { discardIntake } from './intake/discardIntake.js';
import { reprocessIntake } from './intake/reprocessIntake.js';
import { moderatePost } from './community/moderatePost.js';
import { resolveReport } from './community/resolveReport.js';
import { setPostHighlight } from './community/setPostHighlight.js';
import type { RequestContext } from './context.js';

/**
 * SEC-01 — `viewer` é somente leitura, de verdade.
 *
 * A auditoria achou que `viewer` e `operator` **existiam só como texto**: apareciam no tipo
 * de papel, na allowlist do convite e na validação do JWT, e em lugar nenhum na
 * autorização. Toda guarda era binária — ou owner/admin, ou "equipe" —, e "equipe" inclui
 * `viewer`. Quem fosse convidado como somente-leitura apagava evento da agenda, lançava
 * gasto, registrava pagamento a fornecedor, liberava cashback, cancelava inscrição, fundia
 * clientes e criava versão de preço.
 *
 * Convidar alguém para olhar e entregar poder de escrever é pior do que não ter o papel:
 * quem convida acredita ter limitado, e não limitou.
 *
 * `operator` mantém o comportamento atual de propósito — uma matriz mais fina entre
 * `operator` e `admin` é decisão de produto, separada desta correção.
 */

const viewer: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u9', role: 'viewer' },
};

/*
 * Deps vazias: a guarda tem de disparar **antes** de qualquer I/O. `TypeError` de
 * repositório indefinido aqui significa guarda tardia — o banco já foi tocado.
 */
const semDeps = {} as never;

const escritas: readonly [string, () => Promise<unknown>][] = [
  ['allocateBooking', () => allocateBooking(semDeps, viewer, semDeps)],
  ['allocateManualBooking', () => allocateManualBooking(semDeps, viewer, semDeps)],
  ['cancelBooking', () => cancelBooking(semDeps, viewer, semDeps)],
  ['markBookingInvoice', () => markBookingInvoice(semDeps, viewer, semDeps)],
  ['undoCheckIn', () => undoCheckIn(semDeps, viewer, semDeps)],
  ['createScheduleEvent', () => createScheduleEvent(semDeps, viewer, semDeps)],
  ['updateScheduleEvent', () => updateScheduleEvent(semDeps, viewer, semDeps)],
  ['deleteScheduleEvent', () => deleteScheduleEvent(semDeps, viewer, semDeps)],
  ['registerCustomer', () => registerCustomer(semDeps, viewer, semDeps)],
  ['mergeCustomers', () => mergeCustomers(semDeps, viewer, semDeps)],
  ['moveToResponsible', () => moveToResponsible(semDeps, viewer, semDeps)],
  ['promoteToResponsible', () => promoteToResponsible(semDeps, viewer, semDeps)],
  ['updateCustomer', () => updateCustomer(semDeps, viewer, semDeps)],
  ['createItinerary', () => createItinerary(semDeps, viewer, semDeps)],
  ['updateItinerary', () => updateItinerary(semDeps, viewer, semDeps)],
  ['setItineraryPhotos', () => setItineraryPhotos(semDeps, viewer, semDeps)],
  ['addItineraryPriceVersion', () => addItineraryPriceVersion(semDeps, viewer, semDeps)],
  ['createSupplier', () => createSupplier(semDeps, viewer, semDeps)],
  ['updateSupplier', () => updateSupplier(semDeps, viewer, semDeps)],
  ['createSupplierCategory', () => createSupplierCategory(semDeps, viewer, semDeps)],
  ['addSupplierExpense', () => addSupplierExpense(semDeps, viewer, semDeps)],
  ['registerSupplierPayment', () => registerSupplierPayment(semDeps, viewer, semDeps)],
  ['accrueCashback', () => accrueCashback(semDeps, viewer, semDeps)],
  ['expireCashback', () => expireCashback(semDeps, viewer, semDeps)],
  ['allocateFromQueue', () => allocateFromQueue(semDeps, viewer, semDeps)],
  ['discardIntake', () => discardIntake(semDeps, viewer, semDeps)],
  ['reprocessIntake', () => reprocessIntake(semDeps, viewer, semDeps)],
  ['moderatePost', () => moderatePost(semDeps, viewer, semDeps)],
  ['resolveReport', () => resolveReport(semDeps, viewer, semDeps)],
  ['setPostHighlight', () => setPostHighlight(semDeps, viewer, semDeps)],
];

describe('SEC-01: viewer não escreve', () => {
  it.each(escritas)('%s recusa viewer antes de qualquer I/O', async (_nome, chamar) => {
    await expect(chamar()).rejects.toBeInstanceOf(ForbiddenError);
  });
});
