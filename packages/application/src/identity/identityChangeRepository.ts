import type { Cpf, LocalDate } from '@expedition/domain';

/**
 * Port da fila de revisão de dados do cliente. O pedido guarda os **novos valores
 * propostos** (só os campos que mudam) e nasce `pending`. Aprovar aplica a mudança ao
 * cliente; recusar arquiva com motivo. Escrita mediada pelo servidor (RLS SELECT-only).
 *
 * Duas origens alimentam a mesma fila:
 *   · PC-07 — o cliente pede correção de identidade pelo portal (nome/CPF/nascimento)
 *   · IN-04 — a alocação detecta que o CPF já cadastrado chegou com nome, nascimento,
 *     telefone ou e-mail diferentes; enfileira em vez de sobrescrever (`requestedBy` nulo)
 */

export interface NewIdentityChangeRequest {
  readonly tenantId: string;
  readonly customerId: string;
  readonly requestedBy: string | null;
  readonly fullName: string | null;
  readonly cpf: Cpf | null;
  readonly birthDate: LocalDate | null;
  /** IN-04: contato proposto (a via do portal não os usa). */
  readonly email: string | null;
  readonly phone: string | null;
  readonly reason: string | null;
}

export interface IdentityChangeRequestRecord {
  readonly id: string;
  readonly customerId: string;
  readonly status: string; // pending | approved | rejected
  readonly fullName: string | null;
  readonly cpf: string | null; // dígitos crus; a máscara é no DTO
  readonly birthDate: LocalDate | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly reason: string | null;
  readonly decidedBy: string | null;
  readonly decisionNote: string | null;
  readonly createdAt: Date;
}

export interface IdentityDecision {
  readonly status: 'approved' | 'rejected';
  readonly decidedBy: string;
  readonly decidedAt: Date;
  readonly decisionNote: string | null;
}

export interface IdentityChangeRepository {
  create(request: NewIdentityChangeRequest): Promise<IdentityChangeRequestRecord>;
  findById(tenantId: string, id: string): Promise<IdentityChangeRequestRecord | null>;
  /** Pendentes do tenant, para a revisão no back-office. */
  listPending(tenantId: string): Promise<IdentityChangeRequestRecord[]>;
  /** Grava a decisão (aprovado/recusado) com quem/quando/nota. */
  decide(
    tenantId: string,
    id: string,
    decision: IdentityDecision,
  ): Promise<IdentityChangeRequestRecord>;
}
