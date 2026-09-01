import { useState } from 'react';
import {
  useGroupResult,
  type ActionResult,
  type GroupExpense,
  type GroupResult,
  type SupplierOption,
  type SupplierPaymentInput,
} from './useGroupResult.js';
import { brl } from '../ui/money.js';

/**
 * Resultado do grupo (GR-08/09/10) na mesa. Receita = contratado das confirmadas;
 * gastos = contratado com fornecedores; margem bruta = receita − gastos. Lançar gasto
 * e pagar fornecedor ficam aqui, ao lado do número que produzem. "A pagar" usa o accent
 * do tenant, como "a receber" — cor de dado (verde/vermelho) fica na margem, que é o dado.
 */
export function ResultPanel({ groupId }: { groupId: string }): React.JSX.Element {
  const { state, refresh, addExpense, payExpense, deleteExpense, busy } = useGroupResult(groupId);

  return (
    <section className="result-section">
      <div className="board-titlerow">
        <h2 className="card-title">Resultado do grupo</h2>
      </div>

      {state.status === 'loading' && <p className="members-empty">Carregando resultado…</p>}

      {state.status === 'error' && (
        <div className="state" role="alert">
          <div className="state-text">
            <span className="state-title">Não deu para carregar o resultado</span>
            <span className="state-line is-error">Tente de novo.</span>
          </div>
          <div className="state-grow" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>
            Tentar de novo
          </button>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <ResultStats result={state.result} />
          <ExpensesTable
            expenses={state.expenses}
            busy={busy}
            onPay={payExpense}
            onDelete={deleteExpense}
          />
          <AddExpense suppliers={state.suppliers} busy={busy} onAdd={addExpense} />
        </>
      )}
    </section>
  );
}

function ResultStats({ result }: { result: GroupResult }): React.JSX.Element {
  const marginClass = result.grossMarginCents < 0 ? ' is-no' : ' is-go';
  return (
    <div className="stats">
      <div className="stat">
        <span className="stat-num">
          <span className="stat-unit">R$</span>
          {brl(result.revenueContractedCents)}
        </span>
        <span className="stat-label">Receita</span>
        <span className="stat-context">contratado confirmado</span>
      </div>
      <div className="stat">
        <span className="stat-num">
          <span className="stat-unit">R$</span>
          {brl(result.expenseTotalCents)}
        </span>
        <span className="stat-label">Gastos</span>
        <span className="stat-context">contratado com fornecedores</span>
      </div>
      <div className="stat">
        <span className={`stat-num${marginClass}`}>
          <span className="stat-unit">R$</span>
          {brl(result.grossMarginCents)}
        </span>
        <span className="stat-label">Margem bruta</span>
        <span className="stat-context">
          {result.marginPercent === null ? 'sem receita' : `${result.marginPercent}% da receita`}
        </span>
      </div>
      <div className="stat">
        <span className="stat-num">
          <span className="stat-unit">R$</span>
          {brl(result.supplierOutstandingCents)}
        </span>
        <span className="stat-label">A pagar</span>
        <span className="stat-context">
          {brl(result.paidToSuppliersCents)} já pago aos fornecedores
        </span>
      </div>
    </div>
  );
}

function ExpensesTable({
  expenses,
  busy,
  onPay,
  onDelete,
}: {
  expenses: GroupExpense[];
  busy: boolean;
  onPay: (expenseId: string, input: SupplierPaymentInput) => Promise<ActionResult>;
  onDelete: (expenseId: string) => Promise<ActionResult>;
}): React.JSX.Element {
  if (expenses.length === 0) {
    return <p className="members-empty">Nenhum gasto lançado neste grupo ainda.</p>;
  }
  const totals = expenses.reduce(
    (acc, e) => ({
      total: acc.total + e.totalCents,
      paid: acc.paid + e.paidCents,
      out: acc.out + e.outstandingCents,
    }),
    { total: 0, paid: 0, out: 0 },
  );
  return (
    <div className="tbl-wrap">
      <div className="tbl tbl-exp2">
        <div className="tbl-row tbl-head">
          <span>Fornecedor</span>
          <span>Descrição</span>
          <span className="col-num">Contratado</span>
          <span className="col-num">Pago</span>
          <span className="col-num">Em aberto</span>
          <span />
        </div>
        {expenses.map((expense) => (
          <ExpenseRow
            key={expense.id}
            expense={expense}
            busy={busy}
            onPay={onPay}
            onDelete={onDelete}
          />
        ))}
        <div className="tbl-row tbl-foot">
          <span>Totais</span>
          <span />
          <span className="col-num mono">{brl(totals.total)}</span>
          <span className="col-num mono">{brl(totals.paid)}</span>
          <span className="col-num mono accent">{brl(totals.out)}</span>
          <span />
        </div>
      </div>
    </div>
  );
}

function ExpenseRow({
  expense,
  busy,
  onPay,
  onDelete,
}: {
  expense: GroupExpense;
  busy: boolean;
  onPay: (expenseId: string, input: SupplierPaymentInput) => Promise<ActionResult>;
  onDelete: (expenseId: string) => Promise<ActionResult>;
}): React.JSX.Element {
  const [paying, setPaying] = useState(false);
  const settled = expense.outstandingCents <= 0;
  const [erro, setErro] = useState<string | null>(null);

  const excluir = async () => {
    setErro(null);
    const result = await onDelete(expense.id);
    if (!result.ok) setErro(result.message);
  };

  return (
    <>
      {erro && (
        <div className="feedback feedback-error">
          <span className="feedback-dot" />
          <span>{erro}</span>
        </div>
      )}
      <div className="tbl-row">
        <span className="cell-name">{expense.supplierName}</span>
        <span className="cell-contact">{expense.description}</span>
        <span className="col-num mono">{brl(expense.totalCents)}</span>
        <span className="col-num mono">{brl(expense.paidCents)}</span>
        <span className="col-num mono accent">{brl(expense.outstandingCents)}</span>
        <span className="col-right">
          {settled ? (
            <span className="pill pill-go">quitado</span>
          ) : (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setPaying((v) => !v)}
            >
              {paying ? 'Fechar' : 'Pagar'}
            </button>
          )}
          {/*
           * Só aparece enquanto nada foi pago: gasto com pagamento o servidor recusa, e
           * botão que existe para dar erro é pior que botão que não existe.
           */}
          {expense.paidCents === 0 && (
            <button
              type="button"
              className="btn btn-secondary btn-sm btn-danger"
              disabled={busy}
              onClick={() => void excluir()}
            >
              Excluir
            </button>
          )}
        </span>
      </div>
      {paying && !settled && (
        <PayForm
          busy={busy}
          maxCents={expense.outstandingCents}
          onSubmit={async (input) => {
            const result = await onPay(expense.id, input);
            if (result.ok) setPaying(false);
            return result;
          }}
        />
      )}
    </>
  );
}

function PayForm({
  busy,
  maxCents,
  onSubmit,
}: {
  busy: boolean;
  maxCents: number;
  onSubmit: (input: SupplierPaymentInput) => Promise<ActionResult>;
}): React.JSX.Element {
  const [amount, setAmount] = useState(centsToReais(maxCents));
  const [method, setMethod] = useState<SupplierPaymentInput['method']>('pix');
  const [paidAt, setPaidAt] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const cents = Math.round(Number(amount.replace(',', '.')) * 100);
  const valid = Number.isFinite(cents) && cents > 0 && paidAt !== '';

  const submit = async () => {
    setError(null);
    const result = await onSubmit({ amountCents: cents, method, paidAt });
    if (!result.ok) setError(result.message);
  };

  return (
    <div className="rowpanel">
      {error && (
        <div className="feedback feedback-error">
          <span className="feedback-dot" />
          <span>{error}</span>
        </div>
      )}
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Valor (R$)</span>
          <input
            className="field-input is-mono"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Forma</span>
          <select
            className="field-input"
            value={method}
            onChange={(e) => setMethod(e.target.value as SupplierPaymentInput['method'])}
          >
            <option value="pix">Pix</option>
            <option value="boleto">Boleto</option>
            <option value="card">Cartão</option>
            <option value="cash">Dinheiro</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Data</span>
          <input
            type="date"
            className="field-input is-mono"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
          />
        </label>
      </div>
      <div className="form-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!valid || busy}
          onClick={() => void submit()}
        >
          {busy ? 'Pagando…' : 'Registrar pagamento'}
        </button>
      </div>
    </div>
  );
}

function AddExpense({
  suppliers,
  busy,
  onAdd,
}: {
  suppliers: SupplierOption[];
  busy: boolean;
  onAdd: (input: {
    supplierId: string;
    description: string;
    totalCents: number;
  }) => Promise<ActionResult>;
}): React.JSX.Element {
  const [supplierId, setSupplierId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const cents = Math.round(Number(amount.replace(',', '.')) * 100);
  const valid =
    supplierId !== '' && description.trim() !== '' && Number.isFinite(cents) && cents > 0;

  if (suppliers.length === 0) {
    return (
      <p className="members-empty">
        Cadastre um fornecedor na tela de Fornecedores para lançar gastos aqui.
      </p>
    );
  }

  const submit = async () => {
    setError(null);
    const result = await onAdd({ supplierId, description: description.trim(), totalCents: cents });
    if (result.ok) {
      setSupplierId('');
      setDescription('');
      setAmount('');
    } else {
      setError(result.message);
    }
  };

  return (
    <div className="add-expense">
      <span className="rowpanel-title">Lançar gasto</span>
      {error && (
        <div className="feedback feedback-error">
          <span className="feedback-dot" />
          <span>{error}</span>
        </div>
      )}
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Fornecedor</span>
          <select
            className="field-input"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
          >
            <option value="">Escolher…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field field-wide">
          <span className="field-label">Descrição</span>
          <input
            className="field-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Hospedagem, alimentação…"
          />
        </label>
        <label className="field">
          <span className="field-label">Valor (R$)</span>
          <input
            className="field-input is-mono"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
          />
        </label>
      </div>
      <div className="form-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!valid || busy}
          onClick={() => void submit()}
        >
          {busy ? 'Lançando…' : 'Lançar gasto'}
        </button>
      </div>
    </div>
  );
}

function centsToReais(cents: number): string {
  return (cents / 100).toFixed(2);
}

function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
