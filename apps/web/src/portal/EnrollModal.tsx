import { useEffect, useMemo, useState } from 'react';
import { usePortalEnroll, type Expedition, type FamilyMember } from './usePortalBrowse.js';
import { formatCents, formatDateRangeLong } from './format.js';
import { familyBudget } from './familyBudget.js';
import { useItineraryPrices } from '../itineraries/useItineraryPrices.js';
import { useItinerariesAdmin } from '../itineraries/useItinerariesAdmin.js';

/**
 * Inscrição do cliente numa saída (§5.8): escolhe quem da família vai e envia. A inscrição
 * nasce pendente; o cashback só é liberado quando ela é confirmada. Usado na vitrine
 * (Expedições) e na página do roteiro — o mesmo fluxo, aberto de dois lugares.
 *
 * Abre com **todos marcados** (o caso comum é a família inteira) e mostra o valor da
 * seleção, recalculado a cada troca pelas funções do domínio (§3.4) — desmarcar alguém
 * muda a base casal/solo, então o número precisa acompanhar.
 */
export function EnrollModal({
  expedition,
  family,
  onClose,
  onDone,
}: {
  expedition: Expedition;
  family: FamilyMember[] | null;
  onClose: () => void;
  onDone: (itineraryName: string) => void;
}): React.JSX.Element {
  const { enroll, busy } = usePortalEnroll();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const pricesState = useItineraryPrices(expedition.itineraryId);
  const catalog = useItinerariesAdmin();

  // A família inteira vai por padrão; desmarcar é a exceção.
  useEffect(() => {
    if (family) setSelected(new Set(family.map((m) => m.id)));
  }, [family]);

  const itinerary =
    catalog.state.status === 'ready'
      ? catalog.state.itineraries.find((i) => i.id === expedition.itineraryId)
      : undefined;

  const budget = useMemo(() => {
    if (!family || pricesState.status !== 'ready' || !itinerary) return null;
    const going = family.filter((m) => selected.has(m.id));
    return familyBudget(going, pricesState.prices, expedition.startDate, {
      childYoungMaxAge: itinerary.childYoungMaxAge,
      childMidMaxAge: itinerary.childMidMaxAge,
    });
  }, [family, selected, pricesState, itinerary, expedition.startDate]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async () => {
    setError(null);
    const result = await enroll(expedition.groupId, [...selected]);
    if (result.ok) onDone(expedition.itineraryName);
    else setError(result.message);
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Inscrever-se">
      <div className="modal">
        <h2 className="modal-title">Inscrever-se · {expedition.itineraryName}</h2>
        <div className="enroll-when">
          <span className="stat-label">Quando</span>
          <span className="enroll-when-date">
            {formatDateRangeLong(expedition.startDate, expedition.endDate)}
          </span>
        </div>

        {error && (
          <div className="feedback feedback-error">
            <span className="feedback-dot" />
            <span>{error}</span>
          </div>
        )}

        <p className="field-help">Quem vai te acompanhar nessa aventura?</p>
        {family === null ? (
          <p className="members-empty">Carregando a família…</p>
        ) : family.length === 0 ? (
          <p className="members-empty">Nenhum membro na família para inscrever.</p>
        ) : (
          <div className="enroll-list">
            {family.map((member) => (
              <label key={member.id} className="check-row">
                <input
                  type="checkbox"
                  className="check"
                  checked={selected.has(member.id)}
                  onChange={() => toggle(member.id)}
                />
                <span className="check-name">{member.fullName}</span>
                <span className="check-role">
                  {member.role === 'responsible' ? 'responsável' : 'acompanhante'}
                </span>
              </label>
            ))}
          </div>
        )}

        {budget && (
          <div className="enroll-total">
            <span className="stat-label">Valor total</span>
            <span className="stat-num">
              <span className="stat-unit">R$</span>
              {formatCents(budget.totalCents)}
            </span>
          </div>
        )}

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || selected.size === 0}
            onClick={() => void submit()}
          >
            {busy ? 'Inscrevendo…' : 'Confirmar inscrição'}
          </button>
        </div>
      </div>
    </div>
  );
}
