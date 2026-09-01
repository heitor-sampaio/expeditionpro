import { useState } from 'react';
import type { BoardRow } from './useGroupBoard.js';
import type { ActionResult, useGroupActions } from './useGroupActions.js';
import {
  usePaymentIntegrations,
  type PaymentEnvironment,
} from '../integrations/usePaymentIntegrations.js';
import { useChargeQuote } from './useChargeQuote.js';
import { brl } from '../ui/money.js';

type Actions = ReturnType<typeof useGroupActions>;

/**
 * PG-02 — emite a cobrança da inscrição no ASAAS. Fica ao lado do lançamento manual, não
 * no lugar dele: o que for pago fora (dinheiro, transferência direta) continua entrando
 * à mão.
 *
 * O valor digitado é o **líquido**: o que precisa sobrar depois das taxas. A prévia do
 * bruto vem do **servidor**, que pergunta a taxa ao ASAAS — o mesmo caminho da emissão,
 * para o que a tela promete ser o que o cliente recebe.
 *
 * Vem preenchido com o que falta pagar. A data de vencimento é obrigatória: cobrança sem
 * prazo o provedor recusa.
 *
 * O **ambiente é o que está conectado** — não adianta a tela decidir sozinha por produção
 * se a conta ligada é a de testes. Com os dois conectados, a equipe escolhe; a taxa usada
 * no cálculo é sempre a daquele ambiente.
 */
export function ChargeControl({
  row,
  actions,
  onFeedback,
  onEmitted,
  onClose,
}: {
  row: BoardRow;
  actions: Actions;
  onFeedback: (feedback: { kind: 'go' | 'info' | 'no'; text: string }) => void;
  onEmitted: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const [billingType, setBillingType] = useState<'PIX' | 'BOLETO' | 'CREDIT_CARD'>('PIX');
  const [dueDate, setDueDate] = useState('');
  const [installments, setInstallments] = useState(1);
  const [amount, setAmount] = useState(String((row.dueCents / 100).toFixed(2)));
  const { state: integrations } = usePaymentIntegrations();
  const connected = integrations.status === 'ready' ? integrations.rows : [];
  // Produção primeiro quando os dois estão ligados: cobrar de verdade é o caso comum.
  const preferred =
    connected.find((row) => row.environment === 'production')?.environment ??
    connected[0]?.environment ??
    null;
  const [environment, setEnvironment] = useState<PaymentEnvironment | null>(null);
  const chosen = environment ?? preferred;
  const netCents = Math.round(Number(amount.replace(',', '.')) * 100);
  const quote = useChargeQuote(chosen, billingType, installments, netCents);

  const submit = async () => {
    if (!chosen) return;
    const result: ActionResult = await actions.createCharge(row.bookingId, {
      environment: chosen,
      billingType,
      dueDate,
      ...(billingType === 'CREDIT_CARD' && installments > 1 ? { installments } : {}),
      ...(Number.isFinite(netCents) && netCents > 0 ? { amountCents: netCents } : {}),
    });
    if (result.ok) {
      onFeedback({ kind: 'go', text: 'Cobrança emitida — ela aparece na lista abaixo.' });
      onClose();
      onEmitted();
    } else {
      onFeedback({ kind: 'no', text: result.message });
    }
  };

  return (
    <div className="rowpanel-drawer">
      <h3 className="drawer-title">Emitir cobrança</h3>
      <p className="drawer-sub">
        O valor é o que precisa sobrar; o cliente paga as taxas por cima. Pago no ASAAS, o
        recebimento entra sozinho.
      </p>
      <div className="form-grid">
        {connected.length > 1 && (
          <label className="field">
            <span className="field-label">Conta</span>
            <select
              className="field-input"
              value={chosen ?? ''}
              onChange={(e) => setEnvironment(e.target.value as PaymentEnvironment)}
            >
              {connected.map((row) => (
                <option key={row.environment} value={row.environment}>
                  {row.environment === 'sandbox' ? 'Sandbox (teste)' : 'Produção'}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span className="field-label">Forma</span>
          <select
            className="field-input"
            value={billingType}
            onChange={(e) => setBillingType(e.target.value as typeof billingType)}
          >
            <option value="PIX">Pix</option>
            <option value="BOLETO">Boleto</option>
            <option value="CREDIT_CARD">Cartão</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Vencimento</span>
          <input
            className="field-input is-mono"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Valor a receber</span>
          <input
            className="field-input is-mono"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        {billingType === 'CREDIT_CARD' && (
          <label className="field">
            <span className="field-label">Parcelas</span>
            <select
              className="field-input"
              value={installments}
              onChange={(e) => setInstallments(Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}x
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {chosen === 'sandbox' && (
        <div className="feedback feedback-info">
          <span className="feedback-dot" />
          <span>Conta de testes: esta cobrança não é real.</span>
        </div>
      )}

      {quote.status === 'loading' && <p className="field-help">Consultando as taxas no ASAAS…</p>}
      {quote.status === 'ready' && (
        <p className="field-help">
          O cliente paga <strong>{`R$ ${brl(quote.grossAmountCents)}`}</strong> para sobrarem{' '}
          {`R$ ${brl(quote.netAmountCents)}`} — transação {(quote.transactionBps / 100).toFixed(2)}%
          {quote.fixedCents > 0 ? ` + R$ ${brl(quote.fixedCents)}` : ''}
          {quote.anticipationBps > 0
            ? `, antecipação ${(quote.anticipationBps / 100).toFixed(2)}%`
            : ''}
          .
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
          disabled={actions.busy || dueDate === ''}
          onClick={() => void submit()}
        >
          Emitir
        </button>
      </div>
    </div>
  );
}
