import { registerCompanion } from '../customers/registerCompanion.js';
import { actorFamilyHead } from './familyScope.js';
import type { RequestContext } from '../context.js';
import type { CustomerRecord, CustomerRepository } from '../customers/customerRepository.js';

/**
 * PC-08 — o cliente cadastra um acompanhante novo na própria família. Diferente de
 * PC-07 (editar identidade de quem já existe é fila de aprovação), CRIAR um acompanhante
 * com nome/CPF/nascimento é livre — não há snapshot para burlar. O responsável é sempre
 * o **head** da família do ator, nunca vem do corpo (não dá para pendurar em outra família).
 */

export interface RegisterFamilyCompanionDeps {
  readonly customers: CustomerRepository;
}

export interface RegisterFamilyCompanionCommand {
  readonly fullName: string;
  readonly cpf: string;
  readonly birthDate: string; // ISO YYYY-MM-DD
  readonly email?: string | undefined;
  readonly phone?: string | undefined;
}

export async function registerFamilyCompanion(
  deps: RegisterFamilyCompanionDeps,
  ctx: RequestContext,
  command: RegisterFamilyCompanionCommand,
): Promise<CustomerRecord> {
  const head = await actorFamilyHead(deps.customers, ctx);
  return registerCompanion({ customers: deps.customers }, ctx, {
    responsibleId: head,
    fullName: command.fullName,
    cpf: command.cpf,
    birthDate: command.birthDate,
    email: command.email,
    phone: command.phone,
  });
}
