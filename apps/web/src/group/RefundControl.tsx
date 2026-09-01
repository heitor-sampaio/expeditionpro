import { useState } from 'react';
import type { BoardRow } from './useGroupBoard.js';
import type { useGroupActions } from './useGroupActions.js';
import { brl } from '../ui/money.js';

type Actions = ReturnType<typeof useGroupActions>;

/**
 * Devolução do que já entrou (§3.6). Dois destinos, e a diferença é contábil, não
 * cosmética: **dinheiro** sai do caixa; **crédito** fica com a empresa como saldo do
 * cliente — nem receita, nem despesa. Devolver tudo cancela a inscrição no mesmo ato.
 *
 * Só coleta; o servidor valida o teto (não devolve mais do que entrou) e decide o resto.
 */
export function RefundControl({
  row,
  actions,
  onDone,
  onFeedback,
  onClose,
}: {
  readonly row: BoardRow;
  readonly actions: Actions;
  readonly onDone: () => void;
  readonly onFeedback: (f: { kind: 'go' | 'no' | 'info'; text: string }) => void;
  readonly onClose: () => void;
}): React.JSX.Element | null {
  const [amount, setAmount] = useState(brl(row.receivedCents));
  const [destination, setDestination] = useState<'cash' | 'cashback'>('cash');
  const [method, setMethod] = useState('pix');
  const [paidAt, setPaidAt] = useState(today());
  const [reason, setReason] = useState('');

  // Nada recebido, nada a devolver.
  if (row.receivedCents <= 0) return null;

  const amountCents = centsOf(amount);
  const ready = amountCents > 0 && amountCents <= row.receivedCents && reason.trim() !== '';

  const submit = async () => {
    const result = await actions.registerRefund(row.bookingId, {
      amountCents,
      destination,
      ...(destination === 'cash' ? { method } : {}),
      paidAt,
      reason: reason.trim(),
    });
    if (!result.ok) {
      onFeedback({ kind: 'no', text: result.message });
      return;
    }
    const whole = amountCents === row.receivedCents;
    onFeedback({
      kind: destination === 'cash' ? 'no' : 'info',
      text:
        destination === 'cash'
          ? `Devolução de R$ ${amount} registrada.${whole ? ' A inscrição foi cancelada.' : ''}`
          : `R$ ${amount} viraram crédito do cliente.${whole ? ' A inscrição foi cancelada.' : ''}`,
    });
    onClose();
    setReason('');
    onDone();
  };

  return (
    <div className="rowpanel-drawer">
      <h3 className="drawer-title">Registrar devolução</h3>
      <p className="drawer-sub">
        Recebido até agora: R$ {brl(row.receivedCents)}. Devolver em dinheiro ou converter em
        crédito do cliente.
      </p>

      <div className="form-grid">
        <label className="field">
          <span className="field-label">Valor</span>
          <div className="field-money">
            <span className="field-unit">R$</span>
            <input
              className="field-input is-mono"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <span className="field-help">Máximo: R$ {brl(row.receivedCents)}</span>
        </label>

        <label className="field">
          <span className="field-label">Destino</span>
          <select
            className="field-input"
            value={destination}
            onChange={(e) => setDestination(e.target.value as 'cash' | 'cashback')}
          >
            <option value="cash">Devolver em dinheiro</option>
            <option value="cashback">Converter em crédito</option>
          </select>
          <span className="field-help">
            {destination === 'cash'
              ? 'Sai do caixa e deixa de contar como recebido.'
              : 'Fica como saldo do cliente — nem receita, nem despesa.'}
          </span>
        </label>

        {destination === 'cash' && (
          <label className="field">
            <span className="field-label">Forma</span>
            <select
              className="field-input"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="pix">Pix</option>
              <option value="boleto">Boleto</option>
              <option value="card">Cartão</option>
              <option value="cash">Dinheiro</option>
            </select>
          </label>
        )}

        <label className="field">
          <span className="field-label">Data</span>
          <input
            type="date"
            className="field-input is-mono"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
          />
        </label>

        <label className="field field-wide">
          <span className="field-label">Motivo</span>
          <input
            className="field-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Saída cancelada, desistência…"
          />
        </label>
      </div>

      <div className="form-actions">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={actions.busy}
          onClick={onClose}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={actions.busy || !ready}
          onClick={() => void submit()}
        >
          {actions.busy ? 'Registrando…' : 'Registrar devolução'}
        </button>
      </div>
    </div>
  );
}

function centsOf(value: string): number {
  const digits = value
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
