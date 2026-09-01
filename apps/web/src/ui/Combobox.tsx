import { useState } from 'react';

/**
 * Combobox filtrável (§3.3 / CL-05), composto dos primitivos do design system
 * (campo + menu suspenso) — não é um primitivo novo. Comportamento:
 *  · abre a lista completa ao focar, sem exigir digitação
 *  · digitar filtra por substring, sem acento e sem caixa
 *  · "Outro" fixo no rodapé, sempre visível, mesmo sem resultado
 *  · escolher "Outro" entra em modo texto livre
 *  · teclado: setas, Enter, Esc
 */

export interface ComboItem {
  id: string;
  name: string;
}

interface ComboboxProps {
  label: string;
  items: readonly ComboItem[];
  selectedId: string | null;
  /** Não-nulo → modo texto livre ("Outro") ativo. */
  otherValue: string | null;
  onPick: (id: string) => void;
  onPickOther: () => void;
  onOtherChange: (text: string) => void;
  onClear: () => void;
  disabled?: boolean;
  disabledHint?: string;
  placeholder?: string;
}

const norm = (value: string): string => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function Combobox({
  label,
  items,
  selectedId,
  otherValue,
  onPick,
  onPickOther,
  onOtherChange,
  onClear,
  disabled = false,
  disabledHint,
  placeholder,
}: ComboboxProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  if (disabled) {
    return (
      <div className="field">
        <span className="field-label">{label}</span>
        <input
          className="field-input"
          value=""
          disabled
          placeholder={disabledHint ?? ''}
          readOnly
        />
        {disabledHint !== undefined && <span className="field-help">{disabledHint}</span>}
      </div>
    );
  }

  if (otherValue !== null) {
    return (
      <div className="field">
        <span className="field-label">{label}</span>
        <div className="combo-other-row">
          <input
            className="field-input"
            value={otherValue}
            onChange={(event) => onOtherChange(event.target.value)}
            placeholder="Digite o nome"
            aria-label={`${label} (outro)`}
          />
          <button type="button" className="btn btn-secondary btn-sm combo-clear" onClick={onClear}>
            Catálogo
          </button>
        </div>
        <span className="field-help">Fora do catálogo — será revisado.</span>
      </div>
    );
  }

  const selectedName = items.find((item) => item.id === selectedId)?.name ?? '';
  const filtered =
    query.trim() === '' ? items : items.filter((item) => norm(item.name).includes(norm(query)));

  const pick = (item: ComboItem): void => {
    onPick(item.id);
    setQuery('');
    setOpen(false);
  };
  const pickOther = (): void => {
    onPickOther();
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(index + 1, filtered.length));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const item = filtered[active];
      if (active === filtered.length || !item) pickOther();
      else pick(item);
    }
  };

  return (
    <div className="field combo">
      <span className="field-label">{label}</span>
      <input
        className="field-input"
        value={open ? query : selectedName}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder ?? 'Selecione ou digite'}
        role="combobox"
        aria-expanded={open}
      />
      {open && (
        <div className="combo-menu" onMouseDown={(event) => event.preventDefault()}>
          {filtered.length === 0 && (
            <div className="combo-empty">Nada no catálogo bate com a busca.</div>
          )}
          {filtered.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`combo-option${index === active ? ' is-active' : ''}${item.id === selectedId ? ' is-selected' : ''}`}
              onClick={() => pick(item)}
            >
              {item.name}
            </button>
          ))}
          <div className="combo-footer">
            <button
              type="button"
              className={`combo-option${active === filtered.length ? ' is-active' : ''}`}
              onClick={pickOther}
            >
              Outro…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
