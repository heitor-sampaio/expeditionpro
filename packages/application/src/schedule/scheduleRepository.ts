import type { LocalDate } from '@expedition/domain';

/**
 * Port da agenda (§5.4). Um evento de agenda (`schedule_event`) é roteiro + datas
 * no calendário; ao nascer ele cria o grupo correspondente na mesma transação
 * (AG-03), então o port expõe a criação conjunta como uma operação só.
 */

export interface NewScheduleEvent {
  readonly tenantId: string;
  readonly itineraryId: string;
  readonly startDate: LocalDate;
  readonly endDate: LocalDate;
  readonly title: string | null;
  readonly notes: string | null;
  readonly status: string; // scheduled
}

export interface ScheduleEventRecord extends NewScheduleEvent {
  readonly id: string;
}

export interface NewGroup {
  readonly tenantId: string;
  readonly itineraryId: string;
  readonly name: string;
  readonly status: string; // draft|open|closed|in_progress|done|cancelled
  readonly capacityVehicles: number | null; // NULL = sem limite
  readonly visibility: string; // public|private
  readonly pricingMode: string; // itinerary|manual
}

export interface GroupRecord extends NewGroup {
  readonly id: string;
  readonly scheduleEventId: string | null;
}

export interface ScheduleEventWithGroup {
  readonly event: ScheduleEventRecord;
  readonly group: GroupRecord;
}

/** Campos editáveis do evento (AG-04). Datas já resolvidas em LocalDate. */
export interface ScheduleEventUpdate {
  readonly startDate: LocalDate;
  readonly endDate: LocalDate;
  readonly title: string | null;
  readonly notes: string | null;
}

export interface ScheduleRepository {
  /** AG-02/AG-03: cria o evento e seu grupo atomicamente. */
  createEventWithGroup(
    event: NewScheduleEvent,
    group: Omit<NewGroup, 'itineraryId' | 'tenantId'>,
  ): Promise<ScheduleEventWithGroup>;
  listEvents(tenantId: string): Promise<ScheduleEventWithGroup[]>;
  findEventById(tenantId: string, id: string): Promise<ScheduleEventWithGroup | null>;
  /** Grupo por id + o evento que o define (para a data de início na alocação). */
  findGroupById(tenantId: string, groupId: string): Promise<ScheduleEventWithGroup | null>;
  /** AG-04: edita o evento e propaga o nome derivado ao grupo, atomicamente. */
  updateEvent(
    tenantId: string,
    eventId: string,
    event: ScheduleEventUpdate,
    groupName: string,
  ): Promise<ScheduleEventWithGroup>;
  /** AG-05: muda o status do grupo (cancelamento). A guarda de papel/estado é do caso de uso. */
  updateGroupStatus(tenantId: string, groupId: string, status: string): Promise<GroupRecord>;
  /** AG-04: exclui o evento (o grupo cai por cascade). A guarda de inscrições é do caso de uso. */
  deleteEvent(tenantId: string, eventId: string): Promise<void>;
  /** IN-24: vitrine pública — grupos abertos e públicos de um tenant, por slug. */
  listOpenGroupsBySlug(tenantSlug: string): Promise<OpenGroup[]>;
}

/** Grupo aberto exposto na leitura pública (IN-24). Sem nada sensível. */
export interface OpenGroup {
  readonly groupId: string;
  readonly name: string;
  readonly itineraryName: string;
  readonly startDate: LocalDate;
  readonly endDate: LocalDate;
}
