import type {
  GroupRecord,
  NewGroup,
  NewScheduleEvent,
  OpenGroup,
  ScheduleEventUpdate,
  ScheduleEventWithGroup,
  ScheduleRepository,
} from '@expedition/application';
import type { LocalDate } from '@expedition/domain';
import type {
  Group as PrismaGroup,
  ScheduleEvent as PrismaEvent,
} from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma/client.js';
import { tenantClient } from '../prisma/tenantClient.js';

/**
 * Implementação Prisma da agenda. `createEventWithGroup` é atômico (evento + grupo
 * num `$transaction`, AG-03) com tenant_id explícito. Datas são `@db.Date`: LocalDate
 * (domínio) ↔ Date em UTC (banco), convertido nas bordas para não escorregar de fuso.
 */
export function prismaScheduleRepository(base: PrismaClient): ScheduleRepository {
  return {
    async createEventWithGroup(
      event: NewScheduleEvent,
      group: Omit<NewGroup, 'itineraryId' | 'tenantId'>,
    ): Promise<ScheduleEventWithGroup> {
      const { eventRow, groupRow } = await base.$transaction(async (tx) => {
        const eventRow = await tx.scheduleEvent.create({
          data: {
            tenantId: event.tenantId,
            itineraryId: event.itineraryId,
            startDate: localDateToDate(event.startDate),
            endDate: localDateToDate(event.endDate),
            title: event.title,
            notes: event.notes,
            status: event.status,
          },
        });
        const groupRow = await tx.group.create({
          data: {
            tenantId: event.tenantId,
            itineraryId: event.itineraryId,
            scheduleEventId: eventRow.id,
            name: group.name,
            status: group.status,
            capacityVehicles: group.capacityVehicles,
            visibility: group.visibility,
            pricingMode: group.pricingMode,
          },
        });
        return { eventRow, groupRow };
      });
      return toRecord(eventRow, groupRow);
    },

    async listEvents(tenantId: string): Promise<ScheduleEventWithGroup[]> {
      const rows = await tenantClient(base, tenantId).scheduleEvent.findMany({
        where: { deletedAt: null },
        orderBy: { startDate: 'asc' },
        include: { group: true },
      });
      return rows
        .filter((row): row is typeof row & { group: PrismaGroup } => row.group !== null)
        .map((row) => toRecord(row, row.group));
    },

    async findEventById(tenantId: string, id: string): Promise<ScheduleEventWithGroup | null> {
      const row = await tenantClient(base, tenantId).scheduleEvent.findUnique({
        where: { id },
        include: { group: true },
      });
      if (!row || row.group === null) return null;
      return toRecord(row, row.group);
    },

    async findGroupById(tenantId: string, groupId: string): Promise<ScheduleEventWithGroup | null> {
      const group = await tenantClient(base, tenantId).group.findUnique({
        where: { id: groupId },
        include: { scheduleEvent: true },
      });
      if (!group || group.scheduleEvent === null) return null;
      return toRecord(group.scheduleEvent, group);
    },

    async updateEvent(
      tenantId: string,
      eventId: string,
      event: ScheduleEventUpdate,
      groupName: string,
    ): Promise<ScheduleEventWithGroup> {
      const { eventRow, groupRow } = await base.$transaction(async (tx) => {
        const eventRow = await tx.scheduleEvent.update({
          where: { id: eventId, tenantId },
          data: {
            startDate: localDateToDate(event.startDate),
            endDate: localDateToDate(event.endDate),
            title: event.title,
            notes: event.notes,
          },
        });
        const groupRow = await tx.group.update({
          where: { scheduleEventId: eventId },
          data: { name: groupName },
        });
        return { eventRow, groupRow };
      });
      return toRecord(eventRow, groupRow);
    },

    async updateGroupStatus(
      tenantId: string,
      groupId: string,
      status: string,
    ): Promise<GroupRecord> {
      const row = await tenantClient(base, tenantId).group.update({
        where: { id: groupId },
        data: { status },
      });
      return toGroupRecord(row);
    },

    async deleteEvent(tenantId: string, eventId: string): Promise<void> {
      await base.scheduleEvent.delete({ where: { id: eventId, tenantId } });
    },

    async listOpenGroupsBySlug(tenantSlug: string): Promise<OpenGroup[]> {
      const tenant = await base.tenant.findUnique({ where: { slug: tenantSlug } });
      if (!tenant) return [];
      const rows = await base.group.findMany({
        where: {
          tenantId: tenant.id,
          status: 'open',
          visibility: 'public',
          deletedAt: null,
          scheduleEvent: { isNot: null },
          /*
           * IN-24 · SEC — o roteiro também precisa estar publicável, não só o grupo.
           *
           * Este é o único endereço do sistema que responde sem autenticação nenhuma. O
           * filtro conferia o grupo e nunca o roteiro: um `draft` — em preparação, preço
           * ainda não fechado — aparecia na vitrine se alguém abrisse um grupo público
           * nele, e um `archived` seguia anunciado depois de a empresa decidir não vender
           * mais. `custom` é saída negociada; vitrine é `catalog`.
           *
           * Mesmo par que a RLS da galeria já errou uma vez (`app.active_itinerary_ids`
           * olhava o status e esquecia o `kind`): status e kind andam juntos.
           */
          itinerary: { status: 'active', kind: 'catalog' },
        },
        include: { itinerary: true, scheduleEvent: true },
        orderBy: { scheduleEvent: { startDate: 'asc' } },
      });
      return rows
        .filter((row) => row.scheduleEvent !== null)
        .map((row) => ({
          groupId: row.id,
          name: row.name,
          itineraryName: row.itinerary.name,
          startDate: dateToLocalDate(row.scheduleEvent!.startDate),
          endDate: dateToLocalDate(row.scheduleEvent!.endDate),
        }));
    },
  };
}

function toRecord(event: PrismaEvent, group: PrismaGroup): ScheduleEventWithGroup {
  return {
    event: {
      id: event.id,
      tenantId: event.tenantId,
      itineraryId: event.itineraryId,
      startDate: dateToLocalDate(event.startDate),
      endDate: dateToLocalDate(event.endDate),
      title: event.title,
      notes: event.notes,
      status: event.status,
    },
    group: toGroupRecord(group),
  };
}

function toGroupRecord(group: PrismaGroup): GroupRecord {
  return {
    id: group.id,
    tenantId: group.tenantId,
    itineraryId: group.itineraryId,
    scheduleEventId: group.scheduleEventId,
    name: group.name,
    status: group.status,
    capacityVehicles: group.capacityVehicles,
    visibility: group.visibility,
    pricingMode: group.pricingMode,
  };
}

function localDateToDate(date: LocalDate): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

function dateToLocalDate(date: Date): LocalDate {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}
