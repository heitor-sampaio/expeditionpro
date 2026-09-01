import { useConsents } from './useConsents.js';

/**
 * Comunicação no portal (§5.9 · DOC-06 · CM-04). O cliente liga/desliga cada canal com
 * um clique — opt-out imediato. Desmarcado por padrão; é comunicação promocional, nunca
 * o que é execução de contrato (inscrição, nota, avisos da viagem).
 */
export function ConsentsCard({ customerId }: { customerId: string }): React.JSX.Element {
  const { state, refresh, setChannel, busy } = useConsents(customerId);

  return (
    <div className="card">
      <div className="panel-head">
        <h2 className="card-title">Comunicação</h2>
      </div>
      <p className="field-help">
        Novidades e convites são opcionais. Você pode desligar quando quiser — o que é da sua viagem
        continua chegando.
      </p>

      {state.status === 'loading' && <p className="members-empty">Carregando preferências…</p>}

      {state.status === 'error' && (
        <div className="state" role="alert">
          <div className="state-text">
            <span className="state-title">Não deu para carregar as preferências</span>
            <span className="state-line is-error">Tente de novo.</span>
          </div>
          <div className="state-grow" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>
            Tentar de novo
          </button>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <ChannelSwitch
            label="E-mail"
            help="Convites, novidades e lembretes por e-mail."
            checked={state.consents.email}
            busy={busy}
            onChange={(granted) => void setChannel('email', granted)}
          />
          <ChannelSwitch
            label="Notificações no app"
            help="Avisos promocionais por push no aplicativo."
            checked={state.consents.push}
            busy={busy}
            onChange={(granted) => void setChannel('push', granted)}
          />
        </>
      )}
    </div>
  );
}

function ChannelSwitch({
  label,
  help,
  checked,
  busy,
  onChange,
}: {
  label: string;
  help: string;
  checked: boolean;
  busy: boolean;
  onChange: (granted: boolean) => void;
}): React.JSX.Element {
  return (
    <label className="switch-row">
      <span className="switch-label">
        <span className="rowpanel-title">{label}</span>
        <span className="field-help">{help}</span>
      </span>
      <input
        type="checkbox"
        className="switch"
        checked={checked}
        disabled={busy}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
