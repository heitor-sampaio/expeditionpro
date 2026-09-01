import { useState } from 'react';
import {
  usePaymentIntegrations,
  type PaymentEnvironment,
  type PaymentIntegration,
  type ConnectResult,
  type FeeSettingsDto,
} from './usePaymentIntegrations.js';
import { FeeSettingsForm } from './FeeSettingsForm.js';

/**
 * PG-01 — conexão com o ASAAS, um bloco por ambiente. Sandbox e produção são conexões
 * separadas de propósito: dá para testar cobrança sem risco de gerar boleto de verdade.
 *
 * A chave só vai para o servidor; o que volta é o fim dela, para conferência. Cor é dado:
 * conectado em verde, desconectado em cinza — nada de laranja em estado.
 */

const AMBIENTES: readonly { id: PaymentEnvironment; label: string; hint: string }[] = [
  {
    id: 'sandbox',
    label: 'Sandbox',
    hint: 'Ambiente de testes: cobrança que não existe de verdade.',
  },
  {
    id: 'production',
    label: 'Produção',
    hint: 'Conta real: toda cobrança emitida é cobrança de verdade.',
  },
];

export function AsaasCard(): React.JSX.Element {
  const { state, refresh, busy, connect, disconnect, saveFees } = usePaymentIntegrations();

  return (
    <section className="card">
      <div className="panel-head">
        <h2 className="card-title">ASAAS</h2>
      </div>
      <p className="field-help">
        Emite cobrança por pix, boleto ou cartão a partir de uma inscrição. Pago no ASAAS, o
        recebimento entra sozinho e a inscrição é confirmada — o lançamento manual continua
        existindo para o que for pago fora.
      </p>

      {state.status === 'loading' && (
        <div className="skel-card" aria-hidden>
          <div className="skel-bars">
            <div className="skel-bar" />
            <div className="skel-bar short" />
          </div>
        </div>
      )}

      {state.status === 'error' && (
        <div className="state" role="alert">
          <div className="state-text">
            <span className="state-title">Não deu para carregar a integração</span>
            <span className="state-line is-error">Verifique a conexão e tente de novo.</span>
          </div>
          <div className="state-grow" />
          <button type="button" className="btn btn-secondary" onClick={refresh}>
            Tentar de novo
          </button>
        </div>
      )}

      {state.status === 'ready' &&
        AMBIENTES.map((ambiente) => (
          <EnvironmentBlock
            key={ambiente.id}
            environment={ambiente.id}
            label={ambiente.label}
            hint={ambiente.hint}
            connected={state.rows.find((row) => row.environment === ambiente.id) ?? null}
            busy={busy}
            onConnect={connect}
            onDisconnect={disconnect}
            onSaveFees={saveFees}
          />
        ))}
    </section>
  );
}

function EnvironmentBlock({
  environment,
  label,
  hint,
  connected,
  busy,
  onConnect,
  onDisconnect,
  onSaveFees,
}: {
  environment: PaymentEnvironment;
  label: string;
  hint: string;
  connected: PaymentIntegration | null;
  busy: boolean;
  onConnect: (environment: PaymentEnvironment, token: string) => Promise<ConnectResult>;
  onDisconnect: (environment: PaymentEnvironment) => Promise<ConnectResult>;
  onSaveFees: (environment: PaymentEnvironment, settings: FeeSettingsDto) => Promise<ConnectResult>;
}): React.JSX.Element {
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // Só existe na resposta da conexão: some ao sair da tela, como o token de API.
  const [webhookToken, setWebhookToken] = useState<string | null>(null);

  const act = async (promise: Promise<ConnectResult>) => {
    setError(null);
    const result = await promise;
    if (result.ok) {
      setToken('');
      setEditing(false);
      if ('webhookToken' in result && result.webhookToken) setWebhookToken(result.webhookToken);
    } else {
      setError(result.message);
    }
  };

  return (
    <div className="rowpanel-block">
      <div className="panel-head">
        <span className="field-label form-subhead">{label}</span>
        <span className={`pill ${connected ? 'pill-go' : 'pill-neutral'}`}>
          {connected ? 'conectado' : 'desconectado'}
        </span>
      </div>

      {connected && !editing ? (
        <>
          <p className="field-help">
            {connected.accountName ?? 'Conta ASAAS'} · chave {connected.tokenPreview} · desde{' '}
            {formatDate(connected.connectedAt)}
          </p>
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() => setEditing(true)}
            >
              Trocar chave
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm btn-danger"
              disabled={busy}
              onClick={() => void act(onDisconnect(environment))}
            >
              Desconectar
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="field-help">{hint}</p>
          <label className="field">
            <span className="field-label">Chave de API</span>
            <input
              className="field-input is-mono"
              type="password"
              value={token}
              autoComplete="off"
              placeholder="$aact_…"
              onChange={(e) => setToken(e.target.value)}
            />
          </label>
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || token.trim() === ''}
              onClick={() => void act(onConnect(environment, token.trim()))}
            >
              Conectar
            </button>
            {editing && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setEditing(false);
                  setToken('');
                }}
              >
                Cancelar
              </button>
            )}
          </div>
        </>
      )}

      {connected && !editing && (
        <FeeSettingsForm
          environment={environment}
          current={connected.feeSettings}
          busy={busy}
          onSave={onSaveFees}
        />
      )}

      {webhookToken && (
        <div className="key-fresh">
          <span className="field-label">Configure o webhook no ASAAS</span>
          <p className="field-help">
            URL: <code>{webhookUrl()}</code>
          </p>
          <p className="field-help">
            Token de autenticação: <code className="mono">{webhookToken}</code>
          </p>
          <p className="field-help">
            Este token aparece uma única vez — o sistema guarda só um resumo dele, nunca o valor.
            Guarde agora.
          </p>
        </div>
      )}

      {connected && !webhookToken && (
        <p className="field-help">
          No painel do ASAAS, o webhook aponta para <code>{webhookUrl()}</code>. O token de
          autenticação foi mostrado ao conectar e não pode ser lido de novo. Reconectar com outra
          chave <strong>mantém o mesmo token</strong>, para o webhook não parar. Se o token se
          perdeu, desconecte e conecte de novo: aí nasce um novo, e ele precisa ser atualizado no
          ASAAS.
        </p>
      )}

      {error && (
        <div className="feedback feedback-error" role="alert">
          <span className="feedback-dot" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

/**
 * A URL que o ASAAS deve chamar. Precisa ser **pública**: o front fala com a API por
 * caminho relativo (o Vite faz proxy em dev), então o endereço externo não dá para
 * deduzir daqui — vem de `VITE_PUBLIC_API_URL`. Em desenvolvimento, é a URL do túnel
 * (cloudflared, ngrok) apontando para a API local.
 */
function webhookUrl(): string {
  const base = import.meta.env.VITE_PUBLIC_API_URL;
  return base ? `${base}/v1/webhooks/asaas/drk` : WEBHOOK_PATH;
}

const WEBHOOK_PATH = '/v1/webhooks/asaas/drk';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}
