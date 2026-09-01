import { normalizePersonName, parseCpf, parseLocalDate, parsePhone } from '@expedition/domain';
import { BusinessRuleError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';
import { EMPTY_ADDRESS } from './customerRepository.js';
import type { CustomerRecord, CustomerRepository } from './customerRepository.js';
import { DuplicateCpfError } from './errors.js';

/**
 * CL-03 — adiciona um acompanhante a uma família.
 *
 * O acompanhante vira cliente próprio com `responsible_id` apontando para o
 * responsável (§3.2). Exige só nome, CPF e nascimento — e-mail e telefone são
 * opcionais e herdam do responsável. Valida a hierarquia de dois níveis antes de
 * chegar ao trigger (CL-11) e o limite de acompanhantes (configurável, default 4).
 */

const DEFAULT_MAX_COMPANIONS = 4;

export interface RegisterCompanionCommand {
  readonly responsibleId: string;
  readonly fullName: string;
  readonly cpf: string;
  readonly birthDate: string; // ISO YYYY-MM-DD
  readonly email?: string | undefined;
  readonly phone?: string | undefined;
}

export interface RegisterCompanionDeps {
  readonly customers: CustomerRepository;
}

export async function registerCompanion(
  deps: RegisterCompanionDeps,
  ctx: RequestContext,
  command: RegisterCompanionCommand,
  maxCompanions: number = DEFAULT_MAX_COMPANIONS,
): Promise<CustomerRecord> {
  const cpf = parseCpf(command.cpf);
  const birthDate = parseLocalDate(command.birthDate);

  const responsible = await deps.customers.findById(ctx.tenantId, command.responsibleId);
  if (!responsible) throw new NotFoundError('responsável');
  if (responsible.responsibleId !== null) {
    throw new BusinessRuleError(
      'not_a_responsible',
      'Acompanhante não pode ter acompanhante — a família tem dois níveis',
    );
  }

  const existing = await deps.customers.findByCpf(ctx.tenantId, cpf);
  if (existing) throw new DuplicateCpfError();

  const companions = await deps.customers.listByResponsible(ctx.tenantId, responsible.id);
  if (companions.length >= maxCompanions) {
    throw new BusinessRuleError(
      'companion_limit',
      `Limite de ${maxCompanions} acompanhantes atingido para esta família`,
    );
  }

  const rawPhone = blankToNull(command.phone);
  return deps.customers.create({
    tenantId: ctx.tenantId,
    responsibleId: responsible.id,
    fullName: normalizePersonName(command.fullName),
    cpf,
    birthDate,
    email: blankToNull(command.email),
    phone: rawPhone ? parsePhone(rawPhone) : null,
    address: EMPTY_ADDRESS,
  });
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
