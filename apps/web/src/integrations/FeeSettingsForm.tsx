import { useEffect, useRef, useState } from 'react';
import type {
  ConnectResult,
  FeeSettingsDto,
  PaymentEnvironment,
} from './usePaymentIntegrations.js';

/**
 * PG-04 — o único custo que o ASAAS **não** informa por API: a antecipação.
 *
 * A taxa da transação é perguntada ao provedor a cada cobrança (PG-05), com a faixa certa
 * de parcelas — não se digita aqui, e por isso não envelhece quando o plano muda.
 *
 * A antecipação é **ao mês**: cada parcela é antecipada pelo prazo dela, então em 6x o
 * custo é de 3,5 meses (a média dos prazos), não de 6. Pix e boleto não entram — caem na
 * hora e em D+1.
 */
export function FeeSettingsForm({
  environment,
  current,
  busy,
  onSave,
}: {
  environment: PaymentEnvironment;
  current: FeeSettingsDto;
  busy: boolean;
  onSave: (environment: PaymentEnvironment, settings: FeeSettingsDto) => Promise<ConnectResult>;
}): React.JSX.Element {
  const saved = current.card?.anticipationMonthlyBps ?? 0;
  const [monthly, setMonthly] = useState(saved);
  const [feedback, setFeedback] = useState<{ kind: 'go' | 'no'; text: string } | null>(null);

  /*
   * O formulário monta antes de a integração chegar do servidor, então o campo nasce em
   * zero e precisa receber o valor salvo quando ele chega. Sem isto, quem recarregasse a
   * página veria 0,00 no lugar da taxa e, ao salvar qualquer outra coisa, **zeraria** a
   * antecipação sem perceber — dinheiro errado em silêncio.
   *
   * Sincroniza só quando o valor salvo muda, para não atropelar o que está sendo digitado.
   */
  const syncedFrom = useRef<number | null>(null);
  useEffect(() => {
    if (syncedFrom.current === saved) return;
    syncedFrom.current = saved;
    setMonthly(saved);
  }, [saved]);

  const submit = async () => {
    setFeedback(null);
    const result = await onSave(environment, { card: { anticipationMonthlyBps: monthly } });
    setFeedback(
      result.ok ? { kind: 'go', text: 'Taxa salva.' } : { kind: 'no', text: result.message },
    );
  };

  return (
    <div className="fee-form">
      <span className="field-label form-subhead">Antecipação do cartão</span>
      <p className="field-help">
        Se você antecipa os recebimentos do cartão, informe a taxa <strong>ao mês</strong> do seu
        contrato. Ela entra no cálculo da cobrança pelo prazo médio das parcelas — em 6x, 3,5 meses.
        Deixe em zero se não antecipa. A taxa da transação vem do próprio ASAAS.
      </p>

      <div className="form-grid">
        <label className="field">
          <span className="field-label">Taxa ao mês (%)</span>
          <input
            className="field-input is-mono"
            inputMode="decimal"
            disabled={busy}
            value={(monthly / 100).toFixed(2)}
            onChange={(e) => setMonthly(toBps(e.target.value))}
          />
        </label>
      </div>

      {feedback && (
        <div className={`feedback ${feedback.kind === 'go' ? 'feedback-go' : 'feedback-error'}`}>
          <span className="feedback-dot" />
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="form-actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={busy}
          onClick={() => void submit()}
        >
          Salvar taxa
        </button>
      </div>
    </div>
  );
}

/** "1,70" → 170. O inteiro é a verdade, o decimal é a leitura. */
function toBps(text: string): number {
  const parsed = Number(text.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : 0;
}
