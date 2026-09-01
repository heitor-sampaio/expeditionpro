import { useState } from 'react';
import { cents as toCents, netOfFee } from '@expedition/domain';
import { usePaymentIntegrations } from '../integrations/usePaymentIntegrations.js';
import { useChargeQuote } from './useChargeQuote.js';
import type { PaymentInput } from './useGroupActions.js';
import { brl } from '../ui/money.js';

/**
 * IN-08 — lançamento manual de recebimento: o que foi pago sem passar pela cobrança
 * emitida aqui. Botão que abre modal, do mesmo jeito que emitir cobrança — as duas são
 * ações pontuais, e formulário aberto o tempo todo ocupa o painel à toa.
 *
 * PG-09: pix, boleto e cartão **também chegam pelo ASAAS**, então o valor lançado é o que
 * entra na conta, já sem a taxa — a prévia mostra o desconto antes de lançar. Só dinheiro
 * entra integral. A conta é a mesma função de domínio que o servidor usa ao gravar.
 *
 * O primeiro recebimento confirma a inscrição; a regra é do servidor.
 */

/** Como cada forma de pagamento é chamada no provedor. Dinheiro não passa por lá. */
const BILLING: Record<PaymentInput['method'], string | null> = {
  pix: 'PIX',
  boleto: 'BOLETO',
  card: 'CREDIT_CARD',
  cash: null,
};

export function PaymentControl({
  busy,
  onSubmit,
  onClose,
}: {
  busy: boolean;
  onSubmit: (input: PaymentInput) => void;
  onClose: () => void;
}): React.JSX.Element {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentInput['method']>('pix');
  const [paidAt, setPaidAt] = useState(todayIso());
  const amountCents = Math.round(Number(amount.replace(',', '.')) * 100);
  const valid = Number.isFinite(amountCents) && amountCents > 0 && paidAt !== '';

  const { state: integrations } = usePaymentIntegrations();
  const connected = integrations.status === 'ready' ? integrations.rows : [];
  // Mesma preferência do servidor ao gravar: produção primeiro, sandbox se for a única.
  const environment =
    connected.find((row) => row.environment === 'production')?.environment ??
    connected[0]?.environment ??
    null;
  const billingType = BILLING[method];
  const quote = useChargeQuote(
    billingType && valid ? environment : null,
    billingType ?? 'PIX',
    1,
    amountCents,
  );
  const entra =
    quote.status === 'ready'
      ? Number(
          netOfFee(toCents(amountCents), {
            transactionBps: quote.transactionBps,
            fixedCents: toCents(quote.fixedCents),
            anticipationBps: quote.anticipationBps,
          }),
        )
      : null;

  return (
    <div className="rowpanel-drawer">
      <h3 className="drawer-title">Lançar recebimento</h3>
      <p className="drawer-sub">
        Para o que foi pago sem cobrança emitida aqui. O primeiro recebimento confirma a inscrição.
      </p>

      <div className="form-grid">
        <label className="field">
          <span className="field-label">Valor pago (R$)</span>
          <input
            className="field-input is-mono"
            inputMode="decimal"
            value={amount}
            autoFocus
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
          />
        </label>
        <label className="field">
          <span className="field-label">Forma</span>
          <select
            className="field-input"
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentInput['method'])}
          >
            <option value="pix">Pix</option>
            <option value="boleto">Boleto</option>
            <option value="card">Cartão</option>
            <option value="cash">Dinheiro</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Data</span>
          <input
            type="date"
            className="field-input is-mono"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
          />
        </label>
      </div>

      {method === 'cash' && valid && (
        <p className="field-help">Dinheiro não passa pelo gateway: entra integral.</p>
      )}
      {quote.status === 'loading' && <p className="field-help">Consultando as taxas no ASAAS…</p>}
      {entra !== null && (
        <p className="field-help">
          Entra na conta <strong>{`R$ ${brl(entra)}`}</strong> — taxa de{' '}
          {`R$ ${brl(amountCents - entra)}`} descontada pelo ASAAS.
        </p>
      )}
      {quote.status === 'error' && <p className="field-help">{quote.message}</p>}

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!valid || busy}
          onClick={() => onSubmit({ amountCents, method, paidAt })}
        >
          {busy ? 'Lançando…' : 'Lançar'}
        </button>
      </div>
    </div>
  );
}

/** Hoje no fuso de quem lança — o recebimento é datado pelo dia do operador. */
function todayIso(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mm}-${dd}`;
}
