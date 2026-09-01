import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';

/**
 * PG-01 — a conexão do tenant com o ASAAS, por ambiente. O token nunca volta do servidor:
 * a tela mostra `tokenPreview` só para conferir qual chave está lá.
 */

export type PaymentEnvironment = 'sandbox' | 'production';

/**
 * O que se configura por forma de pagamento: só o custo de antecipar, **ao mês**, em
 * basis points (1% = 100). A taxa da transação vem do próprio ASAAS a cada cobrança.
 */
export interface FeeRateDto {
  anticipationMonthlyBps: number;
}

export interface FeeSettingsDto {
  pix?: FeeRateDto;
  boleto?: FeeRateDto;
  card?: FeeRateDto;
}

export interface PaymentIntegration {
  environment: PaymentEnvironment;
  accountName: string | null;
  tokenPreview: string;
  connectedAt: string;
  feeSettings: FeeSettingsDto;
}

export type IntegrationsState =
  { status: 'loading' } | { status: 'ready'; rows: PaymentIntegration[] } | { status: 'error' };

export type ConnectResult = { ok: true; webhookToken?: string } | { ok: false; message: string };

export function usePaymentIntegrations() {
  const [state, setState] = useState<IntegrationsState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api('/v1/payment-integrations', { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setState({ status: 'ready', rows: (await res.json()) as PaymentIntegration[] });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const run = useCallback(
    async (fn: () => Promise<ConnectResult>): Promise<ConnectResult> => {
      setBusy(true);
      const result = await fn();
      setBusy(false);
      if (result.ok) refresh();
      return result;
    },
    [refresh],
  );

  const connect = (environment: PaymentEnvironment, accessToken: string) =>
    run(async () => {
      const res = await api('/v1/payment-integrations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ environment, accessToken }),
      });
      if (!res.ok) return toResult(res);
      // O segredo do webhook só existe nesta resposta — quem chama tem que mostrá-lo.
      const body = (await res.json().catch(() => ({}))) as { webhookToken?: string };
      return {
        ok: true as const,
        ...(body.webhookToken ? { webhookToken: body.webhookToken } : {}),
      };
    });

  const saveFees = (environment: PaymentEnvironment, feeSettings: FeeSettingsDto) =>
    run(async () => {
      const res = await api(`/v1/payment-integrations/${environment}/fees`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ feeSettings }),
      });
      return toResult(res);
    });

  const disconnect = (environment: PaymentEnvironment) =>
    run(async () => {
      const res = await api(`/v1/payment-integrations/${environment}`, { method: 'DELETE' });
      return toResult(res);
    });

  return { state, refresh, busy, connect, disconnect, saveFees };
}

async function toResult(res: Response): Promise<ConnectResult> {
  if (res.ok) return { ok: true };
  const parsed = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, message: messageFor(parsed.error, res.status) };
}

function messageFor(code: string | undefined, status: number): string {
  if (code === 'invalid_credentials') {
    return 'O ASAAS recusou esta chave. Confira o ambiente e a chave copiada.';
  }
  if (code === 'required_field') return 'Cole a chave de API antes de conectar.';
  if (code === 'not_found') return 'Este ambiente não está conectado.';
  if (code === 'invalid_fee') return 'Taxa inválida: use números positivos e abaixo de 100%.';
  if (status === 401 || status === 403) return 'Conectar o gateway exige owner ou admin.';
  if (status === 500) return 'O servidor não está preparado para guardar a chave com segurança.';
  return 'Não foi possível concluir. Tente de novo.';
}
