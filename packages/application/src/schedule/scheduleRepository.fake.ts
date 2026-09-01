import type {
  NewGroup,
  NewScheduleEvent,
  ScheduleEventUpdate,
  ScheduleEventWithGroup,
  ScheduleRepository,
} from './scheduleRepository.js';

/** Fake in-memory do port da agenda. Excluído do build (`*.fake.ts`). */
export function fakeScheduleRepository(): ScheduleRepository & {
  events: ScheduleEventWithGroup[];
} {
  const events: ScheduleEventWithGroup[] = [];
  let seq = 0;

  return {
    events,
    createEventWithGroup(
      event: NewScheduleEvent,
      group: Omit<NewGroup, 'itineraryId' | 'tenantId'>,
    ) {
      seq += 1;
      const eventId = `event-${seq}`;
      const groupId = `group-${seq}`;
      const record: ScheduleEventWithGroup = {
        event: { ...event, id: eventId },
        group: {
          ...group,
          id: groupId,
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
      const updated: ScheduleEventWithGroup = {
        event: current.event,
        group: { ...current.group, status },
      };
      events[index] = updated;
      return Promise.resolve(updated.group);
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
  };
}
