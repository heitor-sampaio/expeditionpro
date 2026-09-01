import { availableCashback, type CashbackLedgerEntry } from '@expedition/domain';
import { ForbiddenError } from '../errors.js';
import { toLocalDate } from '../support/toLocalDate.js';
import type { RequestContext } from '../context.js';
import type { CashbackEntryRecord, CashbackRepository } from './cashbackRepository.js';

/**
 * CB-08 — extrato e saldo do cliente, sempre derivados do ledger. `balanceCents` é o saldo
 * do ledger (SUM cru); `availableCents` é o **disponível para resgate hoje** (CB-07): sem
 * crédito ainda não liberado nem vencido.
 */

export interface GetCashbackStatementDeps {
  readonly cashback: CashbackRepository;
  /** Data de referência do disponível. Default: agora. */
  readonly clock?: (() => Date) | undefined;
}

export interface GetCashbackStatementCommand {
  readonly customerId: string;
}

export interface CashbackStatement {
  readonly balanceCents: number;
  readonly availableCents: number;
  readonly entries: readonly CashbackEntryRecord[];
}

export async function getCashbackStatement(
  deps: GetCashbackStatementDeps,
  ctx: RequestContext,
  command: GetCashbackStatementCommand,
): Promise<CashbackStatement> {
  // A equipe lê o extrato de qualquer cliente; o cliente (portal) lê só o próprio
  // (cashback é do responsável, CB-03) — nunca o de outra pessoa.
  const ownStatement = ctx.actor.kind === 'customer' && ctx.actor.customerId === command.customerId;
  if (ctx.actor.kind !== 'team' && !ownStatement) {
    throw new ForbiddenError('Extrato de cashback só do próprio cliente ou da equipe');
  }
  const entries = await deps.cashback.listByCustomer(ctx.tenantId, command.customerId);
  const balanceCents = await deps.cashback.balance(ctx.tenantId, command.customerId);
  const today = toLocalDate((deps.clock ?? (() => new Date()))());
  const availableCents = availableCashback(entries as readonly CashbackLedgerEntry[], today);
  return { balanceCents, availableCents, entries };
}
