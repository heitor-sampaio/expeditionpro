import { useState } from 'react';
import { useTeamInvite, type InviteRole } from '../integrations/useTeamInvite.js';
import { useAuth } from '../auth/useAuth.js';
import { useTeamMembers, type MemberRole, type TeamMember } from './useTeamMembers.js';

/**
 * Usuários (§3.7) — convida membros da equipe por e-mail. O papel entra no acesso
 * (app_metadata); o tenant vem da sessão. Só render + chamada; a criação do usuário e o
 * link de acesso são do servidor.
 */
export function UsuariosScreen(): React.JSX.Element {
  const { invite, busy } = useTeamInvite();
  const auth = useAuth();
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

      <AcessoSection souEu={auth.status === 'signed-in' ? auth.userId : null} />
    </main>
  );
}

/**
 * SEC-17 — quem tem acesso ao sistema, e o botão de tirar.
 *
 * Até aqui não havia nem lista nem remoção: o papel vivia só no login do Supabase, e
 * desligar alguém exigia entrar no painel de lá. O papel mostrado é o do banco, o mesmo
 * que o servidor consulta a cada requisição — por isso tirar o acesso vale na requisição
 * seguinte, não quando o token da pessoa expirar.
 */
function AcessoSection({ souEu }: { souEu: string | null }): React.JSX.Element {
  const { state, revoke, refresh, busy } = useTeamMembers();
  const [alvo, setAlvo] = useState<TeamMember | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const confirmar = async () => {
    if (!alvo) return;
    const resultado = await revoke(alvo.userId);
    if (resultado.ok) {
      setAlvo(null);
      setErro(null);
    } else {
      setErro(resultado.message);
    }
  };

  return (
    <section className="card">
      <div className="panel-head">
        <h2 className="card-title">Quem tem acesso</h2>
      </div>

      {state.status === 'loading' && <p className="members-empty">Carregando acessos…</p>}

      {state.status === 'error' && (
        <div className="state" role="alert">
          <div className="state-text">
            <span className="state-title">Não deu para carregar os acessos</span>
            <span className="state-line is-error">Tente de novo.</span>
          </div>
          <div className="state-grow" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>
            Tentar de novo
          </button>
        </div>
      )}

      {state.status === 'forbidden' && (
        <div className="state">
          <div className="state-text">
            <span className="state-title">Sem acesso a esta lista</span>
            <span className="state-line">Ver quem entra no sistema exige owner ou admin.</span>
          </div>
          <div className="state-grow" />
        </div>
      )}

      {state.status === 'ready' && state.members.length === 0 && (
        <p className="members-empty">Ninguém com acesso ainda. Convide alguém acima.</p>
      )}

      {state.status === 'ready' && state.members.length > 0 && (
        <div className="members">
          {state.members.map((m) => (
            <div className="member" key={m.userId}>
              <span className="avatar">{iniciais(m.email)}</span>
              <span className="result-grow">
                <span className="member-name">{m.email ?? 'sem e-mail'}</span>
                <span className="member-cpf">desde {formatarData(m.since)}</span>
              </span>
              <span className="pill pill-neutral">{PAPEL[m.role]}</span>
              {m.userId === souEu ? (
                <span className="member-cpf">você</span>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={busy}
                  onClick={() => {
                    setErro(null);
                    setAlvo(m);
                  }}
                >
                  Tirar acesso
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {alvo && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Tirar acesso">
          <div className="modal">
            <h2 className="modal-title">Tirar acesso</h2>
            <p className="modal-sub">
              {alvo.email ?? 'Esta pessoa'} perde o acesso ao sistema agora. Para voltar, precisa de
              um convite novo.
            </p>

            {erro && (
              <div className="feedback feedback-error form-alert" role="alert">
                <span className="feedback-dot" />
                <span>{erro}</span>
              </div>
            )}

            <div className="form-actions">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => setAlvo(null)}
              >
                Voltar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void confirmar()}
              >
                {busy ? 'Tirando…' : 'Tirar acesso'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

const PAPEL: Record<MemberRole, string> = {
  owner: 'Dono',
  admin: 'Admin',
  operator: 'Operador',
  viewer: 'Leitura',
};

function iniciais(email: string | null): string {
  const base = (email ?? '?').trim();
  return base.slice(0, 2).toUpperCase();
}

/** yyyy-mm-dd → dd/mm/aaaa, sem `new Date` para não escorregar de fuso num dia. */
function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}
