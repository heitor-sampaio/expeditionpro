import { usePortalExpeditions } from './usePortalBrowse.js';
import { usePendingRequests } from './usePendingRequests.js';
import { ItineraryCover } from '../itineraries/ItineraryCover.js';
import { useItineraryCovers } from '../itineraries/useItineraryCovers.js';
import type { HomeState } from './usePortalHome.js';
import { formatDateRange, formatCents } from './format.js';
import { useState } from 'react';
import { checkInAvailability, parseLocalDate } from '@expedition/domain';
import { toLocalDate } from '../ui/toLocalDate.js';
import { useCheckIn } from './useCheckIn.js';
import type { HomeExpedition } from './usePortalHome.js';
import { whatsappLink } from '../ui/whatsapp.js';
import { WhatsAppIcon } from '../ui/WhatsAppIcon.js';
import { TENANT_WHATSAPP } from '../tenant.js';

/**
 * Painel do cliente (§3.7): "Sua próxima aventura" (a inscrição futura mais próxima, se
 * houver) e as próximas saídas da vitrine (2 meses). Só apresentação — a próxima é
 * escolhida por data, sem cálculo de negócio.
 *
 * O vocabulário é o do cliente: a mesma cifra que a equipe lê como "a receber" aparece
 * aqui como **a pagar**. É o mesmo `dueCents` visto do outro lado do balcão.
 */
export function PortalDashboardScreen({
  home,
  onCheckedIn,
  onGoExpeditions,
  onOpenItinerary,
}: {
  home: HomeState;
  onCheckedIn: () => void;
  onGoExpeditions: () => void;
  onOpenItinerary: (itineraryId: string) => void;
}): React.JSX.Element {
  const { state: vitrine } = usePortalExpeditions();
  const coverOf = useItineraryCovers();
  const pending = usePendingRequests();
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const limit = new Date(today);
  limit.setMonth(limit.getMonth() + 2);
  const limitIso = limit.toISOString().slice(0, 10);

  const next =
    home.status === 'ready'
      ? [...home.data.expeditions]
          .filter(
            (e) => e.status !== 'cancelled' && e.status !== 'rejected' && e.endDate >= todayIso,
          )
          .sort((a, b) => a.startDate.localeCompare(b.startDate))[0]
      : undefined;

  const soon =
    vitrine.status === 'ready'
      ? vitrine.expeditions.filter((e) => e.startDate >= todayIso && e.startDate <= limitIso)
      : [];

  return (
    <div className="page page-wide">
      <div className="page-header">
        <div>
          <h1 className="page-title">Início</h1>
          <p className="page-meta">Sua próxima aventura e as saídas que estão chegando.</p>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="feedback feedback-info" role="status">
          <span className="feedback-dot" />
          <span>
            {pending.length === 1
              ? 'Seu pedido de inscrição está em análise pela equipe.'
              : `${pending.length} pedidos de inscrição em análise pela equipe.`}{' '}
            Assim que for aprovado, a expedição aparece aqui.
          </span>
        </div>
      )}

      <section className="next-adv-wrap">
        <span className="dash-eyebrow">Sua próxima aventura</span>
        {home.status === 'loading' && <div className="next-adv is-skeleton" aria-hidden />}
        {home.status === 'error' && (
          <div className="state" role="alert">
            <div className="state-text">
              <span className="state-title">Não deu para carregar</span>
              <span className="state-line is-error">Tente recarregar a página.</span>
            </div>
          </div>
        )}
        {home.status === 'ready' &&
          (next ? (
            <article className="next-adv">
              <div className="next-adv-main">
                <span className={`pill ${statusPill(next.status)}`}>
                  {statusLabel(next.status)}
                </span>
                <h2 className="next-adv-name">{next.groupName}</h2>
                <span className="next-adv-dates">
                  {formatDateRange(next.startDate, next.endDate)}
                </span>
                <span className="next-adv-people">
                  {next.participantCount === 1
                    ? '1 participante'
                    : `${next.participantCount} participantes`}
                </span>
              </div>
              <div className="next-adv-side">
                <div className="next-adv-facts">
                  <div className="next-adv-fact">
                    <span className="stat-label">Valor total</span>
                    <span className="money">
                      <span className="money-unit">R$</span>
                      <span className="stat-num">{formatCents(next.contractedCents)}</span>
                    </span>
                  </div>
                  <div className="next-adv-fact">
                    <span className="stat-label">Valor pago</span>
                    <span className="money">
                      <span className="money-unit">R$</span>
                      <span className="stat-num is-go">{formatCents(next.receivedCents)}</span>
                    </span>
                  </div>
                  <div className="next-adv-fact">
                    <span className="stat-label">A pagar</span>
                    <span className="money">
                      <span className="money-unit">R$</span>
                      <span className="stat-num">{formatCents(next.dueCents)}</span>
                    </span>
                  </div>
                </div>
                <div className="next-adv-cta">
                  <CheckInButton trip={next} onDone={onCheckedIn} />
                  <a
                    className="btn btn-wa btn-ico"
                    href={whatsappLink(
                      TENANT_WHATSAPP,
                      `Olá! Sou do grupo ${next.groupName} e queria falar com a equipe.`,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <WhatsAppIcon />
                    Falar com a equipe
                  </a>
                </div>
              </div>
            </article>
          ) : (
            <div className="next-adv is-empty">
              <div className="state-text">
                <span className="state-title">Nenhuma saída marcada ainda</span>
                <span className="state-line">Escolha uma expedição e garanta sua vaga.</span>
              </div>
              <button type="button" className="btn btn-primary" onClick={onGoExpeditions}>
                Explorar expedições
              </button>
            </div>
          ))}
      </section>

      <section className="dash-section">
        <div className="dash-section-head">
          <h2 className="card-title">Próximas expedições</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onGoExpeditions}>
            Ver todas as expedições
          </button>
        </div>

        {vitrine.status === 'loading' && (
          <div className="rot-card-grid" aria-hidden>
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="rot-card">
                <div className="rot-card-cover rot-card-cover-empty" />
                <div className="rot-card-body">
                  <span className="skel-line" />
                </div>
              </div>
            ))}
          </div>
        )}
        {vitrine.status === 'error' && (
          <div className="state" role="alert">
            <div className="state-text">
              <span className="state-title">Não deu para carregar as saídas</span>
              <span className="state-line is-error">Tente de novo em instantes.</span>
            </div>
          </div>
        )}
        {vitrine.status === 'ready' &&
          (soon.length === 0 ? (
            <div className="state" role="status">
              <div className="state-text">
                <span className="state-title">Nada nos próximos 2 meses</span>
                <span className="state-line">
                  Veja a agenda completa para as saídas mais adiante.
                </span>
              </div>
            </div>
          ) : (
            <div className="rot-card-grid">
              {soon.map((exp) => (
                <button
                  key={exp.groupId}
                  type="button"
                  className="rot-card"
                  onClick={() => onOpenItinerary(exp.itineraryId)}
                  aria-label={`Abrir o roteiro ${exp.itineraryName}`}
                >
                  <ItineraryCover coverPath={coverOf(exp.itineraryId)} />
                  <div className="rot-card-body">
                    <span className="rot-card-name">{exp.itineraryName}</span>
                    <span className="exp-dates">{formatDateRange(exp.startDate, exp.endDate)}</span>
                  </div>
                </button>
              ))}
            </div>
          ))}
      </section>
    </div>
  );
}

/**
 * GR-14 — o check-in do cliente. A régua é a mesma função do domínio que o servidor usa,
 * então o botão só aparece quando a ação existe: no dia da saída e com a inscrição
 * confirmada. Feito o check-in, vira confirmação — não há como desfazer pelo app.
 */
function CheckInButton({
  trip,
  onDone,
}: {
  trip: HomeExpedition;
  onDone: () => void;
}): React.JSX.Element | null {
  const { busy, checkIn } = useCheckIn(onDone);
  const [error, setError] = useState<string | null>(null);

  if (trip.checkedInAt) {
    return (
      <span className="feedback feedback-go next-adv-done">
        <span className="feedback-dot" />
        <span>Check-in feito. Boa viagem!</span>
      </span>
    );
  }

  const availability = checkInAvailability({
    status: trip.status,
    alreadyCheckedIn: false,
    audience: 'customer',
    startDate: parseLocalDate(trip.startDate),
    endDate: parseLocalDate(trip.endDate),
    today: toLocalDate(new Date()),
  });
  if (!availability.allowed) return null;

  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy}
        onClick={() => {
          setError(null);
          void checkIn(trip.bookingId).then((result) => {
            if (!result.ok) setError(result.message);
          });
        }}
      >
        Fazer check-in
      </button>
      {error && (
        <span className="feedback feedback-error next-adv-done" role="alert">
          <span className="feedback-dot" />
          <span>{error}</span>
        </span>
      )}
    </>
  );
}

function statusPill(status: string): string {
  if (status === 'confirmed') return 'pill-go';
  if (status === 'cancelled' || status === 'rejected') return 'pill-no';
  return 'pill-neutral';
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    confirmed: 'confirmada',
    pending: 'pendente',
    cancelled: 'cancelada',
    rejected: 'recusada',
  };
  return map[status] ?? status;
}
