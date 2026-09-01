import { useEffect, useState } from 'react';
import { api } from '../auth/api.js';
import type { PaymentEnvironment } from '../integrations/usePaymentIntegrations.js';

/**
 * PG-05 — quanto o cliente vai pagar para sobrar o líquido digitado. A conta é do
 * servidor, que pergunta a taxa ao ASAAS: a tela não reproduz tabela de preços, senão
 * promete um número e a emissão cobra outro.
 *
 * Debounce de 400ms porque isto acompanha a digitação do valor — sem ele, cada tecla
 * viraria uma chamada à API do provedor.
 */

export type QuoteState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'ready';
      netAmountCents: number;
      grossAmountCents: number;
      transactionBps: number;
      anticipationBps: number;
      fixedCents: number;
    }
  | { status: 'error'; message: string };

export function useChargeQuote(
  environment: PaymentEnvironment | null,
  billingType: string,
  installments: number,
  netAmountCents: number,
): QuoteState {
  const [state, setState] = useState<QuoteState>({ status: 'idle' });

  useEffect(() => {
    if (!environment || !Number.isFinite(netAmountCents) || netAmountCents <= 0) {
      setState({ status: 'idle' });
      return;
    }
    setState({ status: 'loading' });
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void api('/v1/payment-quotes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ environment, billingType, installments, netAmountCents }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            setState({ status: 'error', message: messageFor(body.error) });
            return;
          }
          const quote = (await res.json()) as {
            netAmountCents: number;
            grossAmountCents: number;
            transactionBps: number;
            anticipationBps: number;
            fixedCents: number;
          };
          setState({ status: 'ready', ...quote });
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === 'AbortError')) {
            setState({ status: 'error', message: 'Falha de conexão ao consultar as taxas.' });
          }
        });
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [environment, billingType, installments, netAmountCents]);

  return state;
}

function messageFor(code: string | undefined): string {
  if (code === 'gateway_not_connected') {
    return 'Conecte a conta do ASAAS em Configurações → Integrações.';
  }
  if (code === 'quote_unavailable') return 'O ASAAS não respondeu as taxas agora. Tente de novo.';
  if (code === 'invalid_fee') return 'A taxa configurada não deixa nada a receber.';
  return 'Não deu para calcular o valor da cobrança.';
}
