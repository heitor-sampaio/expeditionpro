import { MarkdownEditor } from '../ui/MarkdownEditor.js';
import type { PriceInput } from './useItinerariesAdmin.js';

/**
 * Peças de formulário do roteiro compartilhadas entre criar (modal) e editar (página):
 * campos de metadados e a tabela de preço. Sem lógica de negócio — a validação de faixas,
 * snapshot e versionamento vivem no servidor.
 */

export const DIFFICULTY = ['fácil', 'moderado', 'difícil'] as const;
export const STATUS_LABEL: Record<string, string> = {
  draft: 'rascunho',
  active: 'ativo',
  archived: 'arquivado',
};

export type Result = { ok: true } | { ok: false; message: string };

export interface MetaState {
  name: string;
  difficulty: string;
  youngMax: string;
  midMax: string;
  description: string;
}

/** Campos de metadados do roteiro compartilhados entre criar e editar (RO-01/02). */
export function ItineraryMetaFields({
  meta,
  set,
}: {
  meta: MetaState;
  set: <K extends keyof MetaState>(key: K, value: MetaState[K]) => void;
}): React.JSX.Element {
  return (
    <>
      <label className="field field-full">
        <span className="field-label">Nome</span>
        <input
          className="field-input"
          value={meta.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Coxilha Rica"
        />
      </label>
      <label className="field">
        <span className="field-label">Dificuldade</span>
        <select
          className="field-input"
          value={meta.difficulty}
          onChange={(e) => set('difficulty', e.target.value)}
        >
          <option value="">—</option>
          {DIFFICULTY.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">Criança menor até (anos)</span>
        <input
          className="field-input is-mono"
          inputMode="numeric"
          value={meta.youngMax}
          onChange={(e) => set('youngMax', e.target.value)}
        />
      </label>
      <label className="field">
        <span className="field-label">Criança maior até (anos)</span>
        <input
          className="field-input is-mono"
          inputMode="numeric"
          value={meta.midMax}
          onChange={(e) => set('midMax', e.target.value)}
        />
      </label>
      <div className="field field-full">
        <span className="field-label">Descrição</span>
        <MarkdownEditor
          mode="headings"
          value={meta.description}
          onChange={(v) => set('description', v)}
          maxLength={4000}
          placeholder="Conte o roteiro: paisagem, dificuldade, o que está incluso…"
        />
      </div>
    </>
  );
}

/** Reais → centavos, para os cinco campos de preço. Vazio ou inválido vira 0. */
export function toCents(reais: string): number {
  const value = Number(reais.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

/** Centavos → string do campo ("200000" → "2000,00"), que `toCents` reconverte sem perda. */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/** Preenche o mapa dos cinco campos de preço a partir de uma versão (centavos). */
export function valuesFromCents(prices: {
  coupleCents: number;
  soloCents: number;
  extraAdultCents: number;
  childMidCents: number;
  childYoungCents: number;
}): Record<string, string> {
  return {
    couple: centsToInput(prices.coupleCents),
    solo: centsToInput(prices.soloCents),
    extraAdult: centsToInput(prices.extraAdultCents),
    childMid: centsToInput(prices.childMidCents),
    childYoung: centsToInput(prices.childYoungCents),
  };
}

export function PriceFieldset({
  values,
  set,
}: {
  values: Record<string, string>;
  set: (key: string, value: string) => void;
}): React.JSX.Element {
  const money = (key: string, label: string) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <div className="field-money">
        <span className="field-unit">R$</span>
        <input
          className="field-money-input is-mono"
          inputMode="decimal"
          value={values[key] ?? ''}
          onChange={(e) => set(key, e.target.value)}
          placeholder="0,00"
        />
      </div>
    </label>
  );
  return (
    <>
      {money('couple', 'Casal (base 2 adultos)')}
      {money('solo', 'Solo (base 1 adulto)')}
      {money('extraAdult', 'Adulto adicional')}
      {money('childMid', 'Criança maior')}
      {money('childYoung', 'Criança menor')}
    </>
  );
}

export function pricesOf(values: Record<string, string>, validFrom: string): PriceInput {
  return {
    validFrom,
    coupleCents: toCents(values['couple'] ?? ''),
    soloCents: toCents(values['solo'] ?? ''),
    extraAdultCents: toCents(values['extraAdult'] ?? ''),
    childMidCents: toCents(values['childMid'] ?? ''),
    childYoungCents: toCents(values['childYoung'] ?? ''),
  };
}
