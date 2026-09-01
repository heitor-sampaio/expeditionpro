import { useState } from 'react';
import { signInWithMagicLink, signInWithPassword } from './authActions.js';

/**
 * Portão de login (§3.7). Os dois métodos na mesma tela: senha (Entrar) e magic link
 * (Enviar link de acesso). Sem lógica de negócio — só chama as ações de auth e mostra
 * o estado. Composta com card/campo/botão do design system; nada hard-coded.
 */
export function LoginScreen(): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'info' | 'no'; text: string } | null>(null);

  const emailOk = /.+@.+\..+/.test(email.trim());

  const enter = async () => {
    setBusy(true);
    setFeedback(null);
    const result = await signInWithPassword(email.trim(), password);
    setBusy(false);
    if (!result.ok) setFeedback({ kind: 'no', text: result.message });
    // sucesso: o onAuthStateChange troca a tela sozinho
  };

  const sendLink = async () => {
    setBusy(true);
    setFeedback(null);
    const result = await signInWithMagicLink(email.trim());
    setBusy(false);
    setFeedback(
      result.ok
        ? { kind: 'info', text: `Enviamos um link para ${email.trim()}. Abra no mesmo navegador.` }
        : { kind: 'no', text: result.message },
    );
  };

  return (
    <div className="login">
      <div className="login-card card">
        <div className="login-brand">
          <span className="brand-mark">DK</span>
          <div>
            <div className="brand-name">Drakkar Expedições</div>
            <div className="brand-sub">ExpeditionPRO</div>
          </div>
        </div>

        <h1 className="card-title login-title">Entrar</h1>
        <p className="page-meta login-sub">
          Acesse com sua senha ou receba um link de acesso por e-mail.
        </p>

        {feedback && (
          <div
            className={`feedback ${feedback.kind === 'no' ? 'feedback-error' : 'feedback-info'}`}
          >
            <span className="feedback-dot" />
            <span>{feedback.text}</span>
          </div>
        )}

        <form
          className="login-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (emailOk && password !== '') void enter();
          }}
        >
          <label className="field">
            <span className="field-label">E-mail</span>
            <input
              className="field-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@drakkar.com"
            />
          </label>
          <label className="field">
            <span className="field-label">Senha</span>
            <input
              className="field-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="deixe em branco para receber um link"
            />
          </label>

          <div className="login-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || !emailOk || password === ''}
            >
              {busy ? 'Entrando…' : 'Entrar'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || !emailOk}
              onClick={() => void sendLink()}
            >
              Enviar link de acesso
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
