import {
  normalizeCep,
  normalizePersonName,
  parseCpf,
  parseLocalDate,
  parsePhone,
  parsePlate,
} from '@expedition/domain';
import { ForbiddenError, RequiredFieldError } from '../errors.js';
import { actorUserId } from '../audit/auditLogRepository.js';
import type { RequestContext } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type {
  ConvoyVehicle,
  CrewAddress,
  CrewCompanion,
  CrewLead,
  TenantRepository,
} from './tenantRepository.js';

/**
 * CF-05 — cadastra o condutor da empresa: quem guia a expedição, viaja junto e abre a
 * roomlist (GR-15) e o comboio (GR-17).
 *
 * Até 2026-08-31 esses dados eram **constante no código**, presos ao tenant `drk`. Virar
 * cadastro resolve as três consequências daquilo: mudar um telefone exigia deploy, o dado
 * pessoal (inclusive a data de nascimento de um menor) vivia no histórico do repositório,
 * e nenhum outro tenant conseguia ter o seu.
 *
 * Validação igual à do cadastro de clientes — CPF com dígito verificador, telefone em
 * E.164, CEP e placa normalizados. O documento que sai daqui vai para fora da empresa.
 */

export interface UpdateCrewLeadDeps {
  readonly tenants: TenantRepository;
  readonly audit: AuditLogRepository;
}

export interface CrewAddressInput {
  readonly street?: string | undefined;
  readonly number?: string | undefined;
  readonly district?: string | undefined;
  readonly city?: string | undefined;
  readonly state?: string | undefined;
  readonly zip?: string | undefined;
}

export interface CrewCompanionInput {
  readonly fullName: string;
  readonly birthDate: string;
}

export interface UpdateCrewLeadCommand {
  readonly fullName: string;
  readonly cpf: string;
  readonly birthDate: string;
  readonly email?: string | null | undefined;
  readonly phone?: string | null | undefined;
  readonly address?: CrewAddressInput | undefined;
  readonly vehicle?: { brand: string; model: string; plate: string } | null | undefined;
  readonly companions?: readonly CrewCompanionInput[] | undefined;
}

export async function updateCrewLead(
  deps: UpdateCrewLeadDeps,
  ctx: RequestContext,
  command: UpdateCrewLeadCommand,
): Promise<CrewLead | null> {
  const { actor } = ctx;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Editar a equipe exige owner ou admin');
  }

  const lead = parseLead(command);
  const saved = await deps.tenants.saveCrewLead(ctx.tenantId, lead);

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(actor),
    entity: 'tenant',
    entityId: ctx.tenantId,
    action: 'crew.update',
    // Contagens, não o cadastro: a trilha não vira segunda cópia do dado pessoal (SEC-04).
    diff: { companions: lead.companions.length, hasVehicle: lead.vehicle !== null },
  });

  return saved;
}

/** Parse, don't validate: depois daqui o condutor é um dado do domínio, não texto. */
function parseLead(command: UpdateCrewLeadCommand): CrewLead {
  const fullName = command.fullName.trim();
  if (fullName === '') throw new RequiredFieldError('nome do condutor');

  return {
    fullName: normalizePersonName(fullName),
    cpf: parseCpf(command.cpf),
    birthDate: parseLocalDate(command.birthDate),
    email: blankToNull(command.email),
    phone: command.phone?.trim() ? parsePhone(command.phone) : null,
    address: parseAddress(command.address),
    vehicle: parseVehicle(command.vehicle),
    companions: (command.companions ?? []).map(parseCompanion),
  };
}

function parseCompanion(companion: CrewCompanionInput): CrewCompanion {
  const fullName = companion.fullName.trim();
  if (fullName === '') throw new RequiredFieldError('nome do acompanhante');
  if (companion.birthDate.trim() === '') {
    throw new RequiredFieldError('nascimento do acompanhante');
  }
  return {
    fullName: normalizePersonName(fullName),
    birthDate: parseLocalDate(companion.birthDate),
  };
}

/** Endereço inteiro opcional: o hotel cobra o titular, não o CEP dele. */
function parseAddress(address: CrewAddressInput | undefined): CrewAddress {
  return {
    street: blankToNull(address?.street),
    number: blankToNull(address?.number),
    district: blankToNull(address?.district),
    city: blankToNull(address?.city),
    state: blankToNull(address?.state),
    zip: address?.zip?.trim() ? normalizeCep(address.zip) : null,
  };
}

function parseVehicle(
  vehicle: { brand: string; model: string; plate: string } | null | undefined,
): ConvoyVehicle | null {
  if (!vehicle) return null;
  const brand = vehicle.brand.trim();
  const model = vehicle.model.trim();
  if (brand === '') throw new RequiredFieldError('marca do veículo');
  if (model === '') throw new RequiredFieldError('modelo do veículo');
  return { brand, model, plate: parsePlate(vehicle.plate) };
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
