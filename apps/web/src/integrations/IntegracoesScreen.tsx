import { useState } from 'react';
import { useApiKeys, type ApiKey } from './useApiKeys.js';
import { AsaasCard } from './AsaasCard.js';
import { ChannelsCard } from './ChannelsCard.js';

/**
 * Integrações — chaves de API do webhook de inscrições. Cor é dado: pill de chave ativa
 * em verde, revogada em vermelho; o accent do tenant só na ação primária. Equipe e
 * cashback moraram aqui antes — hoje são as abas Usuários e Promoções.
 */
export function IntegracoesScreen(): React.JSX.Element {
  return (
    <main className="page page-wide">
      <div className="page-header">
        <h1 className="page-title">Integrações</h1>
        <p className="page-meta">
          Chaves de API do formulário de inscrições, gateway de pagamento e canais de mensagem.
        </p>
      </div>

      <ApiKeysCard />
      <AsaasCard />
      <ChannelsCard />
    </main>
  );
}

function ApiKeysCard(): React.JSX.Element {
  const { state, refresh, create, revoke, busy } = useApiKeys();
  const [name, setName] = useState('');
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onCreate = async () => {
    setError(null);
    const result = await create(name.trim());
    if (result.ok) {
      setFreshToken(result.token);
      setName('');
    } else {
      setError(result.message);
    }
  };

  return (
    <section className="card">
      <div className="panel-head">
        <h2 className="card-title">Chaves de API</h2>
      </div>

      {freshToken && (
        <div className="feedback feedback-info token-callout">
          <div className="token-callout-body">
            <span className="rowpanel-title">Copie agora — o token aparece só uma vez</span>
            <code className="token-value">{freshToken}</code>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setFreshToken(null)}
          >
            Já copiei
          </button>
        </div>
      )}

      {error && (
        <div className="feedback feedback-error">
          <span className="feedback-dot" />
          <span>{error}</span>
        </div>
      )}

      <div className="inline-form">
        <input
          className="field-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome da chave (ex.: formulário do site)"
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || name.trim() === ''}
          onClick={() => void onCreate()}
        >
          Criar chave
        </button>
      </div>

      {state.status === 'loading' && <p className="members-empty">Carregando chaves…</p>}

      {state.status === 'error' && (
        <div className="state" role="alert">
          <div className="state-text">
            <span className="state-title">Não deu para listar as chaves</span>
            <span className="state-line is-error">Tente de novo.</span>
          </div>
          <div className="state-grow" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>
            Tentar de novo
          </button>
        </div>
      )}

      {state.status === 'ready' && state.keys.length === 0 && (
        <p className="members-empty">
          Nenhuma chave criada. A primeira autentica o webhook do formulário.
        </p>
      )}

      {state.status === 'ready' && state.keys.length > 0 && (
        <div className="tbl-wrap tbl-flush">
          <div className="tbl tbl-keys">
            <div className="tbl-row tbl-head">
              <span>Chave</span>
              <span>Token</span>
              <span className="col-num">Usos</span>
              <span>Estado</span>
              <span />
            </div>
            {state.keys.map((key) => (
              <KeyRow key={key.id} apiKey={key} busy={busy} onRevoke={() => void revoke(key.id)} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function KeyRow({
  apiKey,
  busy,
  onRevoke,
}: {
  apiKey: ApiKey;
  busy: boolean;
  onRevoke: () => void;
}): React.JSX.Element {
  return (
    <div className="tbl-row">
      <span className="cell-name">{apiKey.name}</span>
      <span className="mono">{apiKey.masked}</span>
      <span className="col-num mono">{apiKey.useCount}</span>
      <span>
        <span className={`pill ${apiKey.revoked ? 'pill-no' : 'pill-go'}`}>
          {apiKey.revoked ? 'revogada' : 'ativa'}
        </span>
      </span>
      <span className="col-right">
        {!apiKey.revoked && (
          <button
            type="button"
            className="btn btn-secondary btn-sm btn-danger"
            disabled={busy}
            onClick={onRevoke}
          >
            Revogar
          </button>
        )}
      </span>
    </div>
  );
}
