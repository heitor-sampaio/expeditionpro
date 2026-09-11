import type {
  ItineraryRepository,
  NewGroup,
  NewScheduleEvent,
  ScheduleEventUpdate,
  ScheduleEventWithGroup,
  ScheduleRepository,
  TenantRepository,
} from '@expedition/application';

/**
 * Agenda em memória — SÓ para dev sem banco e testes de rota.
 *
 * Recebe os roteiros porque a resolução do link público (IN-25) casa **dois** slugs, e um
 * roteiro que não existe precisa responder como tal: sem isso, qualquer slug devolveria as
 * saídas abertas e a recusa deixaria de ser uma só.
 */
export function inMemorySchedule(
  itineraries?: ItineraryRepository,
  tenants?: TenantRepository,
): ScheduleRepository {
  const events: ScheduleEventWithGroup[] = [];
  let seq = 0;

  return {
    createEventWithGroup(
      event: NewScheduleEvent,
      group: Omit<NewGroup, 'itineraryId' | 'tenantId'>,
    ) {
      seq += 1;
      const eventId = `dev-event-${seq}`;
      const record: ScheduleEventWithGroup = {
        event: { ...event, id: eventId },
        group: {
          ...group,
          id: `dev-group-${seq}`,
          scheduleEventId: eventId,
          tenantId: event.tenantId,
          itineraryId: event.itineraryId,
        },
      };
      events.push(record);
      return Promise.resolve(record);
    },
    listEvents(tenantId: string) {
      return Promise.resolve(events.filter((e) => e.event.tenantId === tenantId));
    },
    findEventById(tenantId: string, id: string) {
      return Promise.resolve(
        events.find((e) => e.event.tenantId === tenantId && e.event.id === id) ?? null,
      );
    },
    findGroupById(tenantId: string, groupId: string) {
      return Promise.resolve(
        events.find((e) => e.event.tenantId === tenantId && e.group.id === groupId) ?? null,
      );
    },
    updateEvent(tenantId: string, eventId: string, event: ScheduleEventUpdate, groupName: string) {
      const index = events.findIndex(
        (e) => e.event.tenantId === tenantId && e.event.id === eventId,
      );
      if (index === -1) return Promise.reject(new Error('event not found'));
      const current = events[index]!;
      const updated: ScheduleEventWithGroup = {
        event: { ...current.event, ...event },
        group: { ...current.group, name: groupName },
      };
      events[index] = updated;
      return Promise.resolve(updated);
    },
    updateGroupStatus(tenantId: string, groupId: string, status: string) {
      const index = events.findIndex(
        (e) => e.event.tenantId === tenantId && e.group.id === groupId,
      );
      if (index === -1) return Promise.reject(new Error('group not found'));
      const current = events[index]!;
      events[index] = { event: current.event, group: { ...current.group, status } };
      return Promise.resolve(events[index]!.group);
    },
    deleteEvent(tenantId: string, eventId: string) {
      const index = events.findIndex(
        (e) => e.event.tenantId === tenantId && e.event.id === eventId,
      );
      if (index !== -1) events.splice(index, 1);
      return Promise.resolve();
    },
    listOpenGroupsBySlug(tenantSlug: string) {
      void tenantSlug;
      return Promise.resolve(
        events
          .filter((e) => e.group.status === 'open' && e.group.visibility === 'public')
          .map((e) => ({
            groupId: e.group.id,
            name: e.group.name,
            itineraryName: e.group.name,
            startDate: e.event.startDate,
            endDate: e.event.endDate,
          })),
      );
    },
    /**
     * IN-25 — o roteiro do link, casando o slug de verdade.
     *
     * Sem os roteiros em mãos não dá para dizer que um slug não existe, e a rota passaria a
     * responder "achei" para qualquer coisa — que é o oposto do que a recusa única promete.
     */
    async findPublicItineraryBySlug(tenantSlug: string, itinerarySlug: string) {
      if (itineraries === undefined || tenants === undefined) return null;
      // O slug do tenant é o que descobre de quem é o link: um slug desconhecido não acha nada,
      // como no banco — senão a recusa deixaria de ser uma só.
      const tenantId = await tenants.findIdBySlug(tenantSlug);
      if (tenantId === null) return null;

      const abertos = events.filter(
        (e) =>
          e.event.tenantId === tenantId &&
          e.group.status === 'open' &&
          e.group.visibility === 'public',
      );
      const primeiro = abertos[0];
      if (primeiro === undefined) return null;

      const todos = await itineraries.list(tenantId);
      const roteiro = todos.find(
        (r) => r.slug === itinerarySlug && r.status === 'active' && r.kind === 'catalog',
      );
      if (roteiro === undefined) return null;

      const doRoteiro = abertos.filter((e) => e.group.itineraryId === roteiro.id);
      return {
        tenantId: primeiro.event.tenantId,
        itineraryId: roteiro.id,
        itineraryName: roteiro.name,
        itinerarySlug: roteiro.slug,
        groups: doRoteiro.map((e) => ({
          groupId: e.group.id,
          name: e.group.name,
          startDate: e.event.startDate,
          endDate: e.event.endDate,
          vacancies: e.group.capacityVehicles,
        })),
      };
    },
  };
}
