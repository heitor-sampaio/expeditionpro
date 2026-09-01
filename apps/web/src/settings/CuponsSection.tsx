import { useState } from 'react';
import { useCoupons, type Coupon, type CouponDraft } from './useCoupons.js';

/**
 * CP-01..CP-04 — os cupons do tenant, dentro de Promoções (é o mesmo assunto do
 * cashback: o que a empresa devolve ou abate). Índice em tabela, criação em cartão.
 *
 * Cor: cupom não é estado financeiro. Ativo e desativado são pill neutra e texto —
 * verde e vermelho ficam reservados a pago e cancelado.
 */
export function CuponsSection(): React.JSX.Element {
  const { state, busy, refresh, create, setActive, remove } = useCoupons();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [creating, setCreating] = useState(false);

  const act = async (promise: Promise<{ ok: boolean; message?: string }>, done: string) => {
    const result = await promise;
    setFeedback(result.ok ? { ok: true, text: done } : { ok: false, text: result.message ?? '' });
    return result.ok;
  };

  return (
    <section className="card">
      <div className="panel-head">
        <h2 className="card-title">Cupons de desconto</h2>
        {state.status === 'ready' && !creating && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setFeedback(null);
              setCreating(true);
            }}
          >
            Criar cupom
          </button>
        )}
      </div>

      {feedback && (
        <div className={`feedback ${feedback.ok ? 'feedback-go' : 'feedback-error'}`}>
          <span className="feedback-dot" />
          <span>{feedback.text}</span>
        </div>
      )}

      {state.status === 'loading' && <p className="members-empty">Carregando cupons…</p>}

      {state.status === 'error' && (
        <div className="state" role="alert">
          <div className="state-text">
            <span className="state-title">Não deu para carregar os cupons</span>
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
            <span className="state-title">Sem acesso aos cupons</span>
            <span className="state-line">Peça a um owner ou admin do tenant.</span>
          </div>
          <div className="state-grow" />
          <button type="button" className="btn btn-secondary btn-sm" disabled>
            Criar cupom
          </button>
        </div>
      )}

      {creating && (
        <CouponForm
          busy={busy}
          onCancel={() => setCreating(false)}
          onSubmit={async (draft) => {
            const ok = await act(create(draft), `Cupom ${draft.code.toUpperCase()} criado.`);
            if (ok) setCreating(false);
            return ok;
          }}
        />
      )}

      {state.status === 'ready' && state.coupons.length === 0 && !creating && (
        <div className="state">
          <div className="state-text">
            <span className="state-title">Nenhum cupom criado</span>
            <span className="state-line">
              Crie um código para dar desconto numa inscrição sem mexer no preço do roteiro.
            </span>
          </div>
          <div className="state-grow" />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setCreating(true)}
          >
            Criar cupom
          </button>
        </div>
      )}

      {state.status === 'ready' && state.coupons.length > 0 && (
        <div className="tbl-wrap">
          <div className="tbl tbl-coupon">
            <div className="tbl-row tbl-head">
              <span>Código</span>
              <span>Desconto</span>
              <span>Validade</span>
              <span>Usos</span>
              <span>Situação</span>
              <span />
            </div>
            {state.coupons.map((coupon) => (
              <CouponRow
                key={coupon.id}
                coupon={coupon}
                busy={busy}
                onToggle={() =>
                  void act(
                    setActive(coupon.id, !coupon.active),
                    coupon.active ? 'Cupom desativado.' : 'Cupom ativado.',
                  )
                }
                onRemove={() => void act(remove(coupon.id), 'Cupom excluído.')}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function CouponRow({
  coupon,
  busy,
  onToggle,
  onRemove,
}: {
  coupon: Coupon;
  busy: boolean;
  onToggle: () => void;
  onRemove: () => void;
}): React.JSX.Element {
  return (
    <div className="tbl-row">
      <span className="mono">{coupon.code}</span>
      <span className="mono">{discountLabel(coupon)}</span>
      <span className="cell-sub">{windowLabel(coupon)}</span>
      <span className="mono">{usesLabel(coupon)}</span>
      <span>
        <span className="pill pill-neutral">{coupon.active ? 'Ativo' : 'Desativado'}</span>
      </span>
      <span className="coupon-line">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={busy}
          onClick={onToggle}
        >
          {coupon.active ? 'Desativar' : 'Ativar'}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={busy}
          onClick={onRemove}
        >
          Excluir
        </button>
      </span>
    </div>
  );
}

function CouponForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (draft: CouponDraft) => Promise<boolean>;
}): React.JSX.Element {
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState('10');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [maxUsesPerCustomer, setMaxUsesPerCustomer] = useState('');
  const [description, setDescription] = useState('');

  const parsedValue = mode === 'percent' ? intOf(value) : centsOf(value);
  const valid = code.trim().length >= 3 && parsedValue > 0;

  return (
    <div className="form-card">
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Código</span>
          <input
            className="field-input is-mono"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="VERAO10"
          />
          <span className="field-help">Letras, números e hífen. É o que o cliente informa.</span>
        </label>
        <label className="field">
          <span className="field-label">Tipo</span>
          <select
            className="field-input"
            value={mode}
            onChange={(event) => setMode(event.target.value as 'percent' | 'fixed')}
          >
            <option value="percent">Percentual</option>
            <option value="fixed">Valor fixo</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">
            {mode === 'percent' ? 'Desconto (%)' : 'Desconto (R$)'}
          </span>
          <input
            className="field-input is-mono"
            inputMode="decimal"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Vale a partir de</span>
          <input
            className="field-input is-mono"
            type="date"
            value={validFrom}
            onChange={(event) => setValidFrom(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Vale até</span>
          <input
            className="field-input is-mono"
            type="date"
            value={validUntil}
            onChange={(event) => setValidUntil(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Limite de usos</span>
          <input
            className="field-input is-mono"
            inputMode="numeric"
            value={maxUses}
            onChange={(event) => setMaxUses(event.target.value)}
            placeholder="sem limite"
          />
        </label>
        <label className="field">
          <span className="field-label">Limite por cliente</span>
          <input
            className="field-input is-mono"
            inputMode="numeric"
            value={maxUsesPerCustomer}
            onChange={(event) => setMaxUsesPerCustomer(event.target.value)}
            placeholder="sem limite"
          />
        </label>
        <label className="field field-full">
          <span className="field-label">Descrição</span>
          <input
            className="field-input"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Campanha de setembro"
          />
        </label>
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || !valid}
          onClick={() =>
            void onSubmit({
              code: code.trim(),
              mode,
              value: parsedValue,
              description: description.trim() === '' ? null : description.trim(),
              validFrom: validFrom === '' ? null : validFrom,
              validUntil: validUntil === '' ? null : validUntil,
              maxUses: maxUses.trim() === '' ? null : intOf(maxUses),
              maxUsesPerCustomer:
                maxUsesPerCustomer.trim() === '' ? null : intOf(maxUsesPerCustomer),
            })
          }
        >
          Criar cupom
        </button>
      </div>
    </div>
  );
}

function discountLabel(coupon: Coupon): string {
  return coupon.mode === 'percent'
    ? `${String(coupon.value)}%`
    : `R$ ${(coupon.value / 100).toFixed(2).replace('.', ',')}`;
}

function windowLabel(coupon: Coupon): string {
  if (!coupon.validFrom && !coupon.validUntil) return 'sem prazo';
  if (coupon.validFrom && coupon.validUntil) {
    return `${brOf(coupon.validFrom)} a ${brOf(coupon.validUntil)}`;
  }
  return coupon.validFrom
    ? `a partir de ${brOf(coupon.validFrom)}`
    : `até ${brOf(coupon.validUntil!)}`;
}

function usesLabel(coupon: Coupon): string {
  return coupon.maxUses === null
    ? String(coupon.uses)
    : `${String(coupon.uses)}/${String(coupon.maxUses)}`;
}

function brOf(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day ?? ''}/${month ?? ''}/${year ?? ''}`;
}

function intOf(raw: string): number {
  const parsed = Math.trunc(Number(raw.replace(/\D/g, '')));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function centsOf(raw: string): number {
  const parsed = Math.round(Number(raw.replace(/\./g, '').replace(',', '.')) * 100);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
