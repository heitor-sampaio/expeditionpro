import { useState } from 'react';
import { CategoriasSection } from './CategoriasSection.js';
import { useSuppliers, type NewSupplierInput, type Supplier } from './useSuppliers.js';
import { useSupplierCategories } from './useSupplierCategories.js';
import { SupplierForm, type SupplierFormValues } from './SupplierForm.js';

/**
 * Fornecedores (FO-01) — índice em tabela com cadastro inline. Índice porque as linhas
 * se comparam entre si (nome, documento, contato); o cadastro abre num cartão acima.
 * Cinco estados de tela. A margem de cada grupo vive na mesa do grupo, não aqui.
 */
export function FornecedoresScreen({
  onOpenFile,
}: {
  onOpenFile: (supplierId: string) => void;
}): React.JSX.Element {
  const { state, refresh, create, busy } = useSuppliers();
  const { categories, createCategory } = useSupplierCategories();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  return (
    <main className="page page-wide">
      <div className="page-header">
        <div className="toolbar">
          <div>
            <h1 className="page-title">Fornecedores</h1>
            <p className="page-meta">Parceiros que prestam serviço nas saídas.</p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setCreating((open) => !open)}
          >
            {creating ? 'Fechar cadastro' : 'Cadastrar fornecedor'}
          </button>
        </div>
      </div>

      {creating && (
        <div className="card">
          <div className="panel-head">
            <h2 className="card-title">Novo fornecedor</h2>
          </div>
          <SupplierForm
            submitLabel="Cadastrar fornecedor"
            busy={busy}
            error={createError}
            categories={categories}
            onCreateCategory={createCategory}
            onCancel={() => setCreating(false)}
            onSubmit={async (values) => {
              setCreateError(null);
              const result = await create(toCreateInput(values));
              if (result.ok) setCreating(false);
              else setCreateError(result.message);
            }}
          />
        </div>
      )}

      {state.status === 'loading' && <IndexSkeleton />}

      {state.status === 'error' && (
        <div className="state" role="alert">
          <div className="state-text">
            <span className="state-title">Não deu para carregar</span>
            <span className="state-line is-error">Verifique a conexão e tente de novo.</span>
          </div>
          <div className="state-grow" />
          <button type="button" className="btn btn-secondary" onClick={refresh}>
            Tentar de novo
          </button>
        </div>
      )}

      {state.status === 'ready' && state.suppliers.length === 0 && (
        <div className="state" role="status">
          <div className="state-text">
            <span className="state-title">Nenhum fornecedor ainda</span>
            <span className="state-line">
              Cadastre o primeiro parceiro para lançar gastos nas saídas.
            </span>
          </div>
        </div>
      )}

      {state.status === 'ready' && state.suppliers.length > 0 && (
        <div className="tbl-wrap">
          <div className="tbl tbl-sup">
            <div className="tbl-row tbl-head">
              <span>Fornecedor</span>
              <span>Categoria</span>
              <span>Documento</span>
              <span>Contato</span>
            </div>
            {state.suppliers.map((supplier) => (
              <SupplierRow key={supplier.id} supplier={supplier} onOpen={onOpenFile} />
            ))}
          </div>
        </div>
      )}
      <CategoriasSection />
    </main>
  );
}

function SupplierRow({
  supplier,
  onOpen,
}: {
  supplier: Supplier;
  onOpen: (supplierId: string) => void;
}): React.JSX.Element {
  return (
    <div
      className="tbl-row tbl-row-click"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(supplier.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(supplier.id);
        }
      }}
    >
      <span className="cell-family">
        <span className="avatar av-no">{initials(supplier.name)}</span>
        <span className="cell-name">{supplier.name}</span>
      </span>
      <span>
        {supplier.categoryName ? (
          <span className="pill pill-neutral">{supplier.categoryName}</span>
        ) : (
          <span className="cell-contact">—</span>
        )}
      </span>
      <span className="mono">
        {supplier.doc ? `${supplier.doc}${supplier.docType ? ` · ${supplier.docType}` : ''}` : '—'}
      </span>
      <span className="cell-contact">{contact(supplier)}</span>
    </div>
  );
}

/** Valores crus do formulário → payload de criação (campos em branco viram ausência). */
export function toCreateInput(values: SupplierFormValues): NewSupplierInput {
  const input: NewSupplierInput = { name: values.name.trim() };
  if (values.doc.trim()) {
    input.doc = values.doc.trim();
    input.docType = values.docType;
  }
  if (values.phone.trim()) input.phone = values.phone.trim();
  if (values.email.trim()) input.email = values.email.trim();
  if (values.pixKey.trim()) input.pixKey = values.pixKey.trim();
  if (values.notes.trim()) input.notes = values.notes.trim();
  if (values.categoryId) input.categoryId = values.categoryId;
  return input;
}

function IndexSkeleton(): React.JSX.Element {
  return (
    <div className="skeleton" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="skel-card">
          <div className="skel-avatar" />
          <div className="skel-bars">
            <div className="skel-bar" />
            <div className="skel-bar short" />
          </div>
        </div>
      ))}
    </div>
  );
}

function contact(supplier: Supplier): string {
  return [supplier.phone, supplier.email].filter(Boolean).join(' · ') || '—';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase();
}
