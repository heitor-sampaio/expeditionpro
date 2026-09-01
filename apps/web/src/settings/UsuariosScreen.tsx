import { useState } from 'react';
import { useTeamInvite, type InviteRole } from '../integrations/useTeamInvite.js';

/**
 * Usuários (§3.7) — convida membros da equipe por e-mail. O papel entra no acesso
 * (app_metadata); o tenant vem da sessão. Só render + chamada; a criação do usuário e o
 * link de acesso são do servidor.
 */
export function UsuariosScreen(): React.JSX.Element {
  const { invite, busy } = useTeamInvite();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InviteRole>('operator');
  const [link, setLink] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'go' | 'no'; text: string } | null>(null);
  const emailOk = /.+@.+\..+/.test(email.trim());

  const send = async () => {
    setFeedback(null);
    setLink(null);
    const result = await invite(email.trim(), role);
    if (result.ok) {
      setFeedback({ kind: 'go', text: `Convite criado para ${email.trim()}.` });
      setLink(result.actionLink);
      setEmail('');
    } else {
      setFeedback({ kind: 'no', text: result.message });
    }
  };

  return (
    <main className="page page-wide">
      <div className="page-header">
        <h1 className="page-title">Usuários</h1>
        <p className="page-meta">Convida membros da equipe e define o papel de acesso.</p>
      </div>

      <section className="card">
        <div className="panel-head">
          <h2 className="card-title">Convidar membro</h2>
        </div>
        <p className="field-help">
          Convida um membro por e-mail. O papel entra no acesso (app_metadata); o tenant vem da sua
          sessão.
        </p>

        {feedback && (
          <div className={`feedback ${feedback.kind === 'go' ? 'feedback-go' : 'feedback-error'}`}>
            <span className="feedback-dot" />
            <span>{feedback.text}</span>
          </div>
        )}

        {link && (
          <div className="feedback feedback-info token-callout">
            <div className="token-callout-body">
              <span className="rowpanel-title">Link de acesso — envie ao convidado</span>
              <code className="token-value">{link}</code>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setLink(null)}
            >
              Ok
            </button>
          </div>
        )}

        <div className="form-grid">
          <label className="field field-wide">
            <span className="field-label">E-mail</span>
            <input
              className="field-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="pessoa@drakkar.com"
            />
          </label>
          <label className="field">
            <span className="field-label">Papel</span>
            <select
              className="field-input"
              value={role}
              onChange={(e) => setRole(e.target.value as InviteRole)}
            >
              <option value="admin">Admin</option>
              <option value="operator">Operador</option>
              <option value="viewer">Leitura</option>
            </select>
          </label>
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !emailOk}
            onClick={() => void send()}
          >
            {busy ? 'Enviando…' : 'Enviar convite'}
          </button>
        </div>
      </section>
    </main>
  );
}
