import { useState } from 'react';
import type { SupplierCategory } from './useSupplierCategories.js';

/**
 * Formulário de fornecedor (FO-01/FO-04), compartilhado entre cadastrar e editar. Emite os
 * valores crus dos campos + se o documento mudou (para a edição não reenviar um CPF mascarado).
 * Sem regra de negócio: validação de documento e dedup vivem no servidor.
 */

export interface SupplierFormValues {
  name: string;
  docType: 'cpf' | 'cnpj';
  doc: string;
  phone: string;
  email: string;
  pixKey: string;
  notes: string;
  categoryId: string; // '' = sem categoria
}

const EMPTY: SupplierFormValues = {
  name: '',
  docType: 'cnpj',
  doc: '',
  phone: '',
  email: '',
  pixKey: '',
  notes: '',
  categoryId: '',
};

export function SupplierForm({
  initial,
  submitLabel,
  busy,
  error,
  categories,
  onCreateCategory,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<SupplierFormValues>;
  submitLabel: string;
  busy: boolean;
  error?: string | null;
  categories: SupplierCategory[];
  onCreateCategory: (name: string) => Promise<SupplierCategory | null>;
  onSubmit: (values: SupplierFormValues, docChanged: boolean) => Promise<void>;
  onCancel?: () => void;
}): React.JSX.Element {
  const base = { ...EMPTY, ...initial };
  const [values, setValues] = useState<SupplierFormValues>(base);
  const set = <K extends keyof SupplierFormValues>(key: K, value: SupplierFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const submit = async () => {
    await onSubmit(values, values.doc !== base.doc);
  };

  return (
    <div className="form-grid">
      {error && (
        <div className="feedback feedback-error field-wide">
          <span className="feedback-dot" />
          <span>{error}</span>
        </div>
      )}
      <label className="field field-wide">
        <span className="field-label">Nome</span>
        <input
          className="field-input"
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
        />
      </label>
      <label className="field">
        <span className="field-label">Tipo</span>
        <select
          className="field-input"
          value={values.docType}
          onChange={(e) => set('docType', e.target.value as 'cpf' | 'cnpj')}
        >
          <option value="cnpj">CNPJ</option>
          <option value="cpf">CPF</option>
        </select>
      </label>
      <label className="field">
        <span className="field-label">Documento</span>
        <input
          className="field-input is-mono"
          value={values.doc}
          onChange={(e) => set('doc', e.target.value)}
          inputMode="numeric"
        />
      </label>
      <label className="field">
        <span className="field-label">Telefone</span>
        <input
          className="field-input is-mono"
          value={values.phone}
          onChange={(e) => set('phone', e.target.value)}
          inputMode="tel"
        />
      </label>
      <label className="field">
        <span className="field-label">E-mail</span>
        <input
          className="field-input"
          value={values.email}
          onChange={(e) => set('email', e.target.value)}
        />
      </label>
      <CategorySelect
        value={values.categoryId}
        categories={categories}
        onChange={(id) => set('categoryId', id)}
        onCreateCategory={onCreateCategory}
      />
      <label className="field field-wide">
        <span className="field-label">Chave PIX</span>
        <input
          className="field-input"
          value={values.pixKey}
          onChange={(e) => set('pixKey', e.target.value)}
          placeholder="CPF, CNPJ, e-mail, celular ou chave aleatória"
        />
        {/*
         * O tipo sai da própria chave, no servidor — não há seletor. Quem cadastra cola o
         * que o fornecedor mandou, e classificar isso é trabalho de computador.
         */}
        <span className="field-help">O sistema reconhece o tipo pela chave.</span>
      </label>

      <label className="field field-wide">
        <span className="field-label">Observações</span>
        <textarea
          className="field-note"
          value={values.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={2}
        />
      </label>
      <div className="form-actions field-wide">
        {onCancel && (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || values.name.trim() === ''}
          onClick={() => void submit()}
        >
          {busy ? 'Salvando…' : submitLabel}
        </button>
      </div>
    </div>
  );
}

function CategorySelect({
  value,
  categories,
  onChange,
  onCreateCategory,
}: {
  value: string;
  categories: SupplierCategory[];
  onChange: (id: string) => void;
  onCreateCategory: (name: string) => Promise<SupplierCategory | null>;
}): React.JSX.Element {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    const created = await onCreateCategory(name);
    setSaving(false);
    if (created) {
      onChange(created.id);
      setNewName('');
      setAdding(false);
    }
  };

  return (
    <label className="field">
      <span className="field-label">Categoria</span>
      {adding ? (
        <div className="cat-add">
          <input
            className="field-input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nova categoria"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void create();
              }
            }}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={saving || newName.trim() === ''}
            onClick={() => void create()}
          >
            {saving ? '…' : 'Criar'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setAdding(false);
              setNewName('');
            }}
          >
            ✕
          </button>
        </div>
      ) : (
        <select
          className="field-input"
          value={value}
          onChange={(e) => {
            if (e.target.value === '__new__') setAdding(true);
            else onChange(e.target.value);
          }}
        >
          <option value="">— sem categoria</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="__new__">+ Nova categoria…</option>
        </select>
      )}
    </label>
  );
}
