import { useState } from 'react';
import { useIntakeDetail } from './useIntakeDetail.js';
import { whatsappLink } from '../ui/whatsapp.js';
import { WhatsAppIcon } from '../ui/WhatsAppIcon.js';
import { initialGroupId } from './queueSelection.js';
import type { ActionResult, GroupOption, QueueItem } from './useQueue.js';

/**
 * IN-17c — a ficha do pedido antes de aprovar: quem vai, que idade cada um terá **na data
 * da saída**, quanto custa, se já é cliente e quanto tem de cashback. A saída escolhida no
 * app já vem selecionada; trocar o grupo recalcula idade e valor (§3.4).
 *
 * O botão de WhatsApp abre a conversa com o responsável — é o canal real de confirmação
 * antes de alocar.
 */
export function IntakeDetailModal({
  item,
  groups,
  busy,
  onAllocate,
  onClose,
}: {
  readonly item: QueueItem;
  readonly groups: GroupOption[];
  readonly busy: boolean;
  readonly onAllocate: (intakeId: string, groupId: string) => Promise<ActionResult>;
  readonly onClose: () => void;
}): React.JSX.Element {
  // Pedido do app já traz a saída escolhida pelo cliente; do site — ou se a saída foi
  // excluída depois do pedido —, começa vazio.
  const [groupId, setGroupId] = useState(() => initialGroupId(item.chosenGroupId, groups));
  const [error, setError] = useState<string | null>(null);
  const state = useIntakeDetail(item.id, groupId);

  const allocate = async () => {
    setError(null);
    const result = await onAllocate(item.id, groupId);
    if (result.ok) onClose();
    else setError(result.message);
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Detalhe da inscrição">
      <div className="modal modal-lg intake-modal">
        <h2 className="modal-title">Inscrição recebida</h2>
        <p className="modal-sub">
          {item.source === 'portal' ? 'Pelo app do cliente' : 'Pelo formulário do site'}
        </p>

        {state.status === 'loading' && <p className="members-empty">Carregando…</p>}
        {state.status === 'error' && (
          <div className="feedback feedback-error" role="alert">
            <span className="feedback-dot" />
            <span>Não deu para carregar o detalhe. Tente de novo.</span>
          </div>
        )}

        {state.status === 'ready' && (
          <>
            <div className="intake-person">
              <div className="intake-person-main">
                <span className="result-name">{state.detail.responsible.fullName}</span>
                <span className="result-sub mono">
                  {state.detail.responsible.cpf}
                  {state.detail.responsible.age !== null &&
                    ` · ${state.detail.responsible.age} anos`}
                </span>
                <span className="result-sub">
                  {state.detail.responsible.phoneDisplay} · {state.detail.responsible.email}
                </span>
              </div>
              <div className="intake-person-tags">
                <span
                  className={`pill ${state.detail.responsible.existingCustomerId ? 'pill-go' : 'pill-neutral'}`}
                >
                  {state.detail.responsible.existingCustomerId ? 'já é cliente' : 'cadastro novo'}
                </span>
                {state.detail.responsible.cashbackBalanceCents > 0 && (
                  <span className="pill pill-go">
                    cashback {brl(state.detail.responsible.cashbackBalanceCents)}
                  </span>
                )}
              </div>
            </div>

            {state.detail.companions.length > 0 && (
              <>
                <span className="field-label form-subhead">Acompanhantes</span>
                <div className="intake-companions">
                  {state.detail.companions.map((person) => (
                    <div key={person.cpf} className="intake-companion">
                      <span className="check-name">{person.fullName}</span>
                      <span className="check-role">
                        {person.age !== null ? `${person.age} anos` : person.birthDate}
                        {person.band ? ` · ${bandLabel(person.band)}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <span className="field-label form-subhead">Saída</span>
            <select
              className="field-input"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              aria-label="Saída para alocar"
            >
              <option value="">Escolher grupo</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>

            {state.detail.quote ? (
              <div className="intake-quote">
                <span className="stat-label">Valor da inscrição</span>
                <span className="stat-num">
                  <span className="stat-unit">R$</span>
                  {brl(state.detail.quote.totalCents)}
                </span>
              </div>
            ) : (
              <p className="field-help">
                Escolha a saída para ver as idades na data da viagem e o valor.
              </p>
            )}

            {error && (
              <div className="feedback feedback-error form-alert" role="alert">
                <span className="feedback-dot" />
                <span>{error}</span>
              </div>
            )}

            <div className="form-actions intake-modal-actions">
              <a
                className="btn btn-secondary btn-ico"
                href={whatsappLink(
                  state.detail.responsible.phoneDigits,
                  `Olá, ${firstName(state.detail.responsible.fullName)}! Recebemos sua inscrição.`,
                )}
                target="_blank"
                rel="noreferrer"
              >
                <WhatsAppIcon />
                Enviar mensagem
              </a>
              <div className="state-grow" />
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Voltar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || groupId === ''}
                onClick={() => void allocate()}
              >
                Aprovar e alocar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function bandLabel(band: string): string {
  if (band === 'child_young') return 'criança menor';
  if (band === 'child_mid') return 'criança maior';
  return 'adulto';
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

function brl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
