import type { Cpf, LocalDate } from '@expedition/domain';

/**
 * Port do repositório de clientes. A aplicação define a interface; a infraestrutura
 * (Prisma) implementa. Fala em value objects do domínio (Cpf, LocalDate), não em
 * tipos do Prisma — o domínio não vaza para cá e o Prisma não vaza para lá.
 */

/** Endereço fiscal (§3.2). Todo opcional; sai na nota (§11.5). CEP guardado só dígitos. */
export interface Address {
  readonly street: string | null;
  readonly number: string | null;
  readonly district: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly zip: string | null;
}

export const EMPTY_ADDRESS: Address = {
  street: null,
  number: null,
  district: null,
  city: null,
  state: null,
  zip: null,
};

export interface NewCustomer {
  readonly tenantId: string;
  readonly responsibleId: string | null;
  readonly fullName: string;
  readonly cpf: Cpf;
  readonly birthDate: LocalDate;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: Address;
}

export interface CustomerRecord extends NewCustomer {
  readonly id: string;
}

/** Ordenação da listagem/busca de clientes (CL-04): por nome (A→Z) ou criação (recente 1º). */
export type CustomerSort = 'name' | 'created';

export interface CustomerRepository {
  findByCpf(tenantId: string, cpf: Cpf): Promise<CustomerRecord | null>;
  findById(tenantId: string, id: string): Promise<CustomerRecord | null>;
  /** Acompanhantes de um responsável (os que apontam para ele). */
  listByResponsible(tenantId: string, responsibleId: string): Promise<CustomerRecord[]>;
  /**
   * GR-15: fichas de vários clientes numa consulta só. A roomlist precisa de todo mundo
   * do grupo — responsáveis e acompanhantes —, e um `findById` por pessoa faria N+1 numa
   * tela que já é a mais pesada do sistema. A ordem do retorno não é garantida: indexe
   * por id. Ids de outro tenant simplesmente não voltam.
   */
  listByIds(tenantId: string, ids: readonly string[]): Promise<CustomerRecord[]>;
  /** Busca por nome (substring, sem acento/caixa), CPF (dígitos) ou telefone — CL-04. */
  search(tenantId: string, query: string, sort: CustomerSort): Promise<CustomerRecord[]>;
  /** Responsáveis (chefes de família) ordenados — para listar todos os clientes (CL-04). */
  listResponsibles(tenantId: string, sort: CustomerSort): Promise<CustomerRecord[]>;
  create(data: NewCustomer): Promise<CustomerRecord>;
  /** Troca o vínculo familiar (CL-10). null torna o cliente responsável. */
  updateResponsible(
    tenantId: string,
    customerId: string,
    responsibleId: string | null,
  ): Promise<CustomerRecord>;
  /** PC-06: edição livre de contato e endereço (nunca nome/CPF/nascimento — PC-07). */
  updateContact(
    tenantId: string,
    customerId: string,
    contact: { email: string | null; phone: string | null; address: Address },
  ): Promise<CustomerRecord>;
  /**
   * CL-06: a equipe reescreve a ficha inteira numa escrita só (identidade + contato +
   * endereço), para a edição do back-office não deixar o cadastro meio salvo.
   */
  updateProfile(
    tenantId: string,
    customerId: string,
    profile: {
      fullName: string;
      cpf: Cpf;
      birthDate: LocalDate;
      email: string | null;
      phone: string | null;
      address: Address;
    },
  ): Promise<CustomerRecord>;
  /** PC-07: aplica mudança de identidade **já aprovada** (só os campos presentes). */
  updateIdentity(
    tenantId: string,
    customerId: string,
    identity: { fullName?: string; cpf?: Cpf; birthDate?: LocalDate },
  ): Promise<CustomerRecord>;
  /**
   * IN-04: aplica mudança de contato **já aprovada** (só os campos presentes), sem tocar
   * no endereço. Usado quando um pedido de revisão de contato (telefone/e-mail) é aceito.
   */
  updateContactInfo(
    tenantId: string,
    customerId: string,
    contact: { email?: string; phone?: string },
  ): Promise<CustomerRecord>;
  /** PC-01: liga a conta do portal (`auth.users.id`) e grava o `portal_status`. */
  linkAuthUser(
    tenantId: string,
    customerId: string,
    authUserId: string,
    portalStatus: string,
  ): Promise<void>;
  /** Move todos os acompanhantes de um responsável para outro (CL-07 merge). */
  reassignDependents(
    tenantId: string,
    fromResponsibleId: string,
    toResponsibleId: string,
  ): Promise<void>;
  /** Remove um cliente (CL-07 merge do duplicado). */
  deleteCustomer(tenantId: string, customerId: string): Promise<void>;
}
