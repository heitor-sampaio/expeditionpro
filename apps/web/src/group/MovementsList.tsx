import { useEffect, useState } from 'react';
import { useBookingCharges, type ChargeRow } from './useBookingCharges.js';
import type { BoardRow } from './useGroupBoard.js';
import type { BookingPayment, useGroupActions } from './useGroupActions.js';
import { brl } from '../ui/money.js';

type Actions = ReturnType<typeof useGroupActions>;
type Feedback = { kind: 'go' | 'info' | 'no'; text: string };

/**
 * PG-06 — o dinheiro da inscrição num lugar só: cobranças emitidas e lançamentos, na
 * mesma tabela, do mais recente para o mais antigo.
 *
 * **Quem conta no caixa é o recebimento**, não a cobrança: a cobrança é promessa, e o
 * lançamento é o dinheiro. Com a taxa repassada ao cliente (PG-08), o valor lançado já é
 * o líquido que entrou na conta — o que ele pagou a mais fica ao lado, para conferir com
 * a fatura.
 */
export function MovementsList({
  row,
  actions,
  chargesKey,
  paymentsKey,
  onFeedback,
  onDeleted,
}: {
  row: BoardRow;
  actions: Actions;
  chargesKey: number;
  paymentsKey: number;
  onFeedback: (feedback: Feedback) => void;
  onDeleted: () => void;
}): React.JSX.Element | null {
  const { rows: charges, reconcile, reconciling } = useBookingCharges(row.bookingId, chargesKey);
  const [payments, setPayments] = useState<BookingPayment[] | null>(null);

  useEffect(() => {
    let alive = true;
    void actions.listPayments(row.bookingId).then((rows) => {
      if (alive) setPayments(rows);
    });
    return () => {
      alive = false;
    };
  }, [row.bookingId, paymentsKey, actions]);

  if (charges === null || payments === null) return null;
  if (charges.length === 0 && payments.length === 0) return null;

  const remove = async (paymentId: string) => {
    const result = await actions.deletePayment(paymentId);
    if (!result.ok) {
      onFeedback({ kind: 'no', text: result.message });
      return;
    }
    onDeleted();
    onFeedback(
      result.requiresDecision
        ? {
            kind: 'info',
            text: 'Era o único recebimento — a inscrição segue confirmada. Decida se mantém ou reverte.',
          }
        : { kind: 'info', text: 'Recebimento excluído do histórico ativo.' },
    );
  };

  const movements = [
    ...charges.map((charge) => ({ kind: 'charge' as const, at: charge.createdAt, charge })),
    ...payments.map((payment) => ({ kind: 'payment' as const, at: payment.paidAt, payment })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const noCaixa = movements.reduce((sum, movement) => sum + incomingOf(movement), 0);

  return (
    <div className="tbl-wrap">
      <div className="tbl tbl-moves">
        <div className="tbl-row tbl-head">
          <span>Data</span>
          <span>Movimento</span>
          <span className="col-num">Cliente paga</span>
          <span className="col-num">Entra na conta</span>
          <span>Situação</span>
          <span />
        </div>

        {movements.map((movement) =>
          movement.kind === 'charge' ? (
            <ChargeRowView
              key={movement.charge.id}
              charge={movement.charge}
              busy={reconciling === movement.charge.id}
              onReconcile={() => void reconcile(movement.charge.id)}
            />
          ) : (
            <PaymentRowView
              key={movement.payment.id}
              payment={movement.payment}
              busy={actions.busy}
              onRemove={() => void remove(movement.payment.id)}
            />
          ),
        )}

        <div className="tbl-row tbl-foot">
          <span>Total</span>
          <span />
          <span />
          <span className="col-num mono">{brl(noCaixa)}</span>
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}

function ChargeRowView({
  charge,
  busy,
  onReconcile,
}: {
  charge: ChargeRow;
  busy: boolean;
  onReconcile: () => void;
}): React.JSX.Element {
  const entra = chargeIncoming(charge);
  return (
    <div className="tbl-row">
      <span className="mono">{formatDate(charge.createdAt)}</span>
      <span>
        <span className="cell-name">Cobrança</span>
        <span className="cell-sub">
          {billingLabel(charge.billingType)}
          {charge.installments > 1 ? ` ${charge.installments}x` : ''} · esperado{' '}
          {brl(charge.netAmountCents)}
        </span>
      </span>
      <span className="col-num mono">{brl(charge.amountCents)}</span>
      <span className="col-num mono" title={chargeTitle(charge)}>
        {/* A cobrança não soma no caixa: quem soma é o recebimento que ela gera. */}
        <span className="nf nf-off">{charge.reconciledAt === null ? '—' : brl(entra)}</span>
      </span>
      <span>
        <span className={`pill ${chargePill(charge.status)}`}>{chargeLabel(charge.status)}</span>
      </span>
      <span className="charge-actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={busy}
          onClick={onReconcile}
        >
          {busy ? '…' : 'Conciliar'}
        </button>
        {charge.invoiceUrl && (
          <a
            className="btn btn-secondary btn-sm"
            href={charge.invoiceUrl}
            target="_blank"
            rel="noreferrer"
          >
            Abrir
          </a>
        )}
      </span>
    </div>
  );
}

function PaymentRowView({
  payment,
  busy,
  onRemove,
}: {
  payment: BookingPayment;
  busy: boolean;
  onRemove: () => void;
}): React.JSX.Element {
  const doGateway = payment.chargeId !== null;
  const pago = payment.customerPaidCents ?? payment.amountCents;
  return (
    <div className="tbl-row">
      <span className="mono">{formatDate(payment.paidAt)}</span>
      <span>
        <span className="cell-name">
          {payment.kind === 'payment' ? 'Recebimento' : kindLabel(payment.kind)}
        </span>
        <span className="cell-sub">
          {doGateway ? 'pelo gateway' : `manual · ${methodLabel(payment.method)}`}
        </span>
      </span>
      <span className="col-num mono">{brl(pago)}</span>
      <span
        className="col-num mono"
        title={
          pago === payment.amountCents
            ? 'Sem taxa: o que o cliente pagou é o que entrou'
            : `Taxa repassada de R$ ${brl(pago - payment.amountCents)}`
        }
      >
        {brl(payment.amountCents)}
      </span>
      <span>
        <span className="pill pill-go">no ledger</span>
      </span>
      <span className="charge-actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm btn-danger"
          disabled={busy}
          onClick={onRemove}
        >
          Excluir
        </button>
      </span>
    </div>
  );
}

type Movement =
  | { kind: 'charge'; at: string; charge: ChargeRow }
  | { kind: 'payment'; at: string; payment: BookingPayment };

/**
 * O que cada linha acrescenta ao caixa. Só recebimento conta: a cobrança é promessa, e
 * somar as duas contaria o mesmo dinheiro duas vezes.
 *
 * Devolução e conversão em crédito entram negativas no ledger e assim somam certo.
 */
function incomingOf(movement: Movement): number {
  return movement.kind === 'payment' ? movement.payment.amountCents : 0;
}

/** O que entra por uma cobrança: creditado + a caminho, ambos líquidos. */
function chargeIncoming(charge: ChargeRow): number {
  return (charge.settledNetCents ?? 0) + (charge.awaitingCreditCents ?? 0);
}

function chargeTitle(charge: ChargeRow): string {
  if (charge.reconciledAt === null) return 'Ainda não conciliada';
  const taxa = (charge.settledGrossCents ?? 0) - chargeIncoming(charge);
  const partes = [`já caiu R$ ${brl(charge.settledNetCents ?? 0)}`];
  if ((charge.awaitingCreditCents ?? 0) > 0) {
    const quando = charge.nextCreditDate
      ? ` (previsto para ${formatDate(charge.nextCreditDate)})`
      : '';
    partes.push(`a caminho R$ ${brl(charge.awaitingCreditCents ?? 0)}${quando}`);
  }
  if (taxa > 0) partes.push(`taxas do gateway R$ ${brl(taxa)}`);
  return partes.join(' · ');
}

function billingLabel(billingType: string): string {
  if (billingType === 'BOLETO') return 'Boleto';
  if (billingType === 'CREDIT_CARD') return 'Cartão';
  return 'Pix';
}

function methodLabel(method: string): string {
  const map: Record<string, string> = {
    pix: 'pix',
    boleto: 'boleto',
    card: 'cartão',
    cash: 'dinheiro',
  };
  return map[method] ?? method;
}

function kindLabel(kind: string): string {
  return kind === 'refund' ? 'Devolução' : 'Virou cashback';
}

function chargePill(status: string): string {
  if (status === 'received' || status === 'confirmed') return 'pill-go';
  if (status === 'cancelled' || status === 'refunded') return 'pill-no';
  return 'pill-neutral';
}

function chargeLabel(status: string): string {
  const map: Record<string, string> = {
    pending: 'aguardando',
    confirmed: 'confirmada',
    received: 'paga',
    overdue: 'vencida',
    refunded: 'estornada',
    cancelled: 'cancelada',
  };
  return map[status] ?? status;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}
