import { useState } from 'react';
import {
  useSupplierFile,
  type FileSaida,
  type FileSupplierPayment,
  type SupplierFileView,
  type SupplierPatchInput,
} from './useSupplierFile.js';
import { useSupplierCategories } from './useSupplierCategories.js';
import { SupplierForm, type SupplierFormValues } from './SupplierForm.js';

/**
 * Ficha do fornecedor (FO-03). Padrão "cabeçalho de entidade + abas + tabela": o
 * fornecedor no topo, três abas (Saídas, Pagamentos, Dados fiscais). Contratado, pago
 * e em aberto vêm derivados do servidor; "em aberto" usa o accent do tenant, como o
 * "a pagar" da mesa. Zero cálculo aqui.
 */

type Tab = 'saidas' | 'pagamentos' | 'fiscais';

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'saidas', label: 'Saídas' },
  { id: 'pagamentos', label: 'Pagamentos' },
  { id: 'fiscais', label: 'Dados fiscais' },
];

interface Props {
  readonly supplierId: string;
  readonly onBack: () => void;
  readonly onOpenGroup: (groupId: string) => void;
}

export function SupplierScreen({ supplierId, onBack, onOpenGroup }: Props): React.JSX.Element {
  const { state, refresh, update } = useSupplierFile(supplierId);

  return (
    <main className="page page-wide">
      <button type="button" className="btn btn-secondary btn-sm back-btn" onClick={onBack}>
        ‹ Voltar aos fornecedores
      </button>

      {state.status === 'loading' && <FileSkeleton />}

      {state.status === 'error' && (
        <div className="state" role="alert">
          <div className="state-text">
            <span className="state-title">Não deu para abrir a ficha</span>
            <span className="state-line is-error">Verifique a conexão e tente de novo.</span>
          </div>
          <div className="state-grow" />
          <button type="button" className="btn btn-secondary" onClick={refresh}>
            Tentar de novo
          </button>
        </div>
      )}

      {state.status === 'ready' && (
        <File file={state.file} onOpenGroup={onOpenGroup} onUpdate={update} />
      )}
    </main>
  );
}

function File({
  file,
  onOpenGroup,
  onUpdate,
}: {
  file: SupplierFileView;
  onOpenGroup: (groupId: string) => void;
  onUpdate: (patch: SupplierPatchInput) => Promise<{ ok: true } | { ok: false; message: string }>;
}): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('saidas');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { categories, createCategory } = useSupplierCategories();
  const { supplier, saidas, pagamentos, totals } = file;

  if (editing) {
    return (
      <div className="card form-card">
        <div className="panel-head">
          <h2 className="card-title">Editar fornecedor</h2>
        </div>
        <SupplierForm
          submitLabel="Salvar fornecedor"
          busy={saving}
          error={error}
          categories={categories}
          onCreateCategory={createCategory}
          onCancel={() => {
            setEditing(false);
            setError(null);
          }}
          initial={{
            name: supplier.name,
            docType: supplier.docType ?? 'cnpj',
            doc: supplier.doc ?? '',
            phone: supplier.phone ?? '',
            email: supplier.email ?? '',
            pixKey: supplier.pixKey ?? '',
            notes: supplier.notes ?? '',
            categoryId: supplier.categoryId ?? '',
          }}
          onSubmit={async (values, docChanged) => {
            setError(null);
            setSaving(true);
            const result = await onUpdate(toPatch(values, docChanged));
            setSaving(false);
            if (result.ok) setEditing(false);
            else setError(result.message);
          }}
        />
      </div>
    );
  }

  return (
    <>
      <div className="entity-head">
        <span className="avatar av-lg av-lg-no">{initials(supplier.name)}</span>
        <div className="entity-id">
          <div className="board-titlerow">
            <h1 className="page-title">{supplier.name}</h1>
            {supplier.docType && (
              <span className="pill pill-neutral">{supplier.docType.toUpperCase()}</span>
            )}
            {supplier.categoryName && (
              <span className="pill pill-neutral">{supplier.categoryName}</span>
            )}
          </div>
          <p className="page-meta">
            {supplier.doc && <span className="mono">{supplier.doc}</span>}
            {supplier.phone && (
              <>
                <span className="meta-dot" />
                <span className="mono">{supplier.phone}</span>
              </>
            )}
            {supplier.email && (
              <>
                <span className="meta-dot" />
                {supplier.email}
              </>
            )}
          </p>
        </div>
        <div className="state-grow" />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
          Editar dados
        </button>
      </div>

      <div className="tabs" role="tablist" aria-label="Abas da ficha">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`tab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'saidas' && <SaidasTab saidas={saidas} totals={totals} onOpenGroup={onOpenGroup} />}
      {tab === 'pagamentos' && <PagamentosTab pagamentos={pagamentos} totals={totals} />}
      {tab === 'fiscais' && <FiscaisTab supplier={supplier} />}
    </>
  );
}

function SaidasTab({
  saidas,
  totals,
  onOpenGroup,
}: {
  saidas: FileSaida[];
  totals: SupplierFileView['totals'];
  onOpenGroup: (groupId: string) => void;
}): React.JSX.Element {
  if (saidas.length === 0) {
    return (
      <div className="state" role="status">
        <div className="state-text">
          <span className="state-title">Nenhuma saída ainda</span>
          <span className="state-line">Este fornecedor ainda não teve gastos lançados.</span>
        </div>
      </div>
    );
  }
  return (
    <div className="tbl-wrap">
      <div className="tbl tbl-fsaidas">
        <div className="tbl-row tbl-head">
          <span>Saída</span>
          <span>Datas</span>
          <span className="col-num">Contratado</span>
          <span className="col-num">Pago</span>
          <span className="col-num">Em aberto</span>
        </div>
        {saidas.map((saida) => (
          <div
            key={saida.groupId}
            className="tbl-row tbl-row-click"
            role="button"
            tabIndex={0}
            onClick={() => onOpenGroup(saida.groupId)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenGroup(saida.groupId);
              }
            }}
          >
            <span className="cell-name">{saida.groupName}</span>
            <span className="mono">
              {saida.startDate} → {saida.endDate}
            </span>
            <span className="col-num mono">{brl(saida.contractedCents)}</span>
            <span className="col-num mono">{brl(saida.paidCents)}</span>
            <span className="col-num mono accent">{brl(saida.outstandingCents)}</span>
          </div>
        ))}
        <div className="tbl-row tbl-foot">
          <span>Totais</span>
          <span />
          <span className="col-num mono">{brl(totals.contractedCents)}</span>
          <span className="col-num mono">{brl(totals.paidCents)}</span>
          <span className="col-num mono accent">{brl(totals.outstandingCents)}</span>
        </div>
      </div>
    </div>
  );
}

function PagamentosTab({
  pagamentos,
  totals,
}: {
  pagamentos: FileSupplierPayment[];
  totals: SupplierFileView['totals'];
}): React.JSX.Element {
  if (pagamentos.length === 0) {
    return (
      <div className="state" role="status">
        <div className="state-text">
          <span className="state-title">Nenhum pagamento ainda</span>
          <span className="state-line">Os pagamentos a este fornecedor aparecem aqui.</span>
        </div>
      </div>
    );
  }
  return (
    <div className="tbl-wrap">
      <div className="tbl tbl-fpag">
        <div className="tbl-row tbl-head">
          <span>Data</span>
          <span>Saída</span>
          <span>Descrição</span>
          <span>Forma</span>
          <span className="col-num">Valor</span>
        </div>
        {pagamentos.map((payment) => (
          <div key={payment.id} className="tbl-row">
            <span className="mono">{payment.paidAt}</span>
            <span className="cell-name">{payment.groupName}</span>
            <span className="cell-contact">{payment.expenseDescription}</span>
            <span>{methodLabel(payment.method)}</span>
            <span className="col-num mono">{brl(payment.amountCents)}</span>
          </div>
        ))}
        <div className="tbl-row tbl-foot">
          <span>Total pago</span>
          <span />
          <span />
          <span />
          <span className="col-num mono">{brl(totals.paidCents)}</span>
        </div>
      </div>
    </div>
  );
}

function FiscaisTab({ supplier }: { supplier: SupplierFileView['supplier'] }): React.JSX.Element {
  return (
    <div className="card">
      <dl className="deflist">
        <DefRow label="Categoria" value={supplier.categoryName ?? '—'} />
        <DefRow label="Documento" value={supplier.doc ?? '—'} mono />
        <DefRow label="Tipo" value={supplier.docType ? supplier.docType.toUpperCase() : '—'} />
        <DefRow label="Chave PIX" value={supplier.pixKey ?? '—'} mono />
        <DefRow label="Telefone" value={supplier.phone ?? '—'} mono />
        <DefRow label="E-mail" value={supplier.email ?? '—'} />
        <DefRow label="Observações" value={supplier.notes ?? '—'} />
      </dl>
    </div>
  );
}

/** Valores do formulário → patch de edição. Documento só vai se mudou (não reenvia máscara). */
function toPatch(values: SupplierFormValues, docChanged: boolean): SupplierPatchInput {
  const patch: SupplierPatchInput = {
    name: values.name.trim(),
    phone: values.phone.trim() || null,
    email: values.email.trim() || null,
    pixKey: values.pixKey.trim() || null,
    notes: values.notes.trim() || null,
    categoryId: values.categoryId || null,
  };
  if (docChanged) {
    patch.doc = values.doc.trim() || null;
    if (values.doc.trim()) patch.docType = values.docType;
  }
  return patch;
}

function DefRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): React.JSX.Element {
  return (
    <div className="def-row">
      <dt className="def-label">{label}</dt>
      <dd className={`def-value${mono ? ' mono' : ''}`}>{value}</dd>
    </div>
  );
}

function FileSkeleton(): React.JSX.Element {
  return (
    <div className="skeleton" aria-hidden>
      <div className="skel-card">
        <div className="skel-avatar" />
        <div className="skel-bars">
          <div className="skel-bar" />
          <div className="skel-bar short" />
        </div>
      </div>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="skel-card">
          <div className="skel-bars">
            <div className="skel-bar" />
            <div className="skel-bar short" />
          </div>
        </div>
      ))}
    </div>
  );
}

function brl(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const reais = Math.floor(abs / 100);
  const cent = String(abs % 100).padStart(2, '0');
  const grouped = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${grouped},${cent}`;
}

function methodLabel(method: string): string {
  const map: Record<string, string> = {
    pix: 'Pix',
    boleto: 'Boleto',
    card: 'Cartão',
    cash: 'Dinheiro',
  };
  return map[method] ?? method;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase();
}
