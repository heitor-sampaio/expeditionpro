import { useEffect, useState } from 'react';
import { api } from '../auth/api.js';
import { useLiveRefresh } from '../live/useLiveRefresh.js';

/**
 * PG-06 — as cobranças emitidas pelo gateway, no financeiro da empresa.
 *
 * Fica **ao lado** dos totais, não dentro deles: cobrança é promessa, e o que entra na
 * receita é o recebimento, quando o provedor avisa que foi paga. Somar cobrança emitida
 * ao faturamento infla previsão de caixa — o mesmo motivo de separar confirmado de
 * projetado (GR-13).
 */

interface ChargeReportRow {
  id: string;
  responsibleName: string;
  groupName: string;
  amountCents: number;
  netAmountCents: number;
  feeCents: number;
  installments: number;
  billingType: string;
  status: string;
  settledNetCents: number | null;
  awaitingCreditCents: number | null;
  anticipationFeeCents: number | null;
  reconciledAt: string | null;
  createdAt: string;
  invoiceUrl: string | null;
}

export function ChargesPanel(): React.JSX.Element | null {
  const [rows, setRows] = useState<ChargeReportRow[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api('/v1/charges?limit=30', { signal: controller.signal })
      .then(async (res) => setRows(res.ok ? ((await res.json()) as ChargeReportRow[]) : []))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setRows([]);
      });
    return () => controller.abort();
  }, [reloadKey]);

  useLiveRefresh('charges-report', [{ table: 'payment_charges' }], () =>
    setReloadKey((k) => k + 1),
  );

  if (rows === null || rows.length === 0) return null;

  const totalCobrado = rows.reduce((sum, row) => sum + row.amountCents, 0);
  const totalEsperado = rows.reduce((sum, row) => sum + row.netAmountCents, 0);
  const totalEntra = rows.reduce((sum, row) => sum + incomingOf(row), 0);

  // O custo do gateway só é conhecido nas cobranças conciliadas: nas outras, "entra"
  // ainda é zero e a diferença seria o valor inteiro, não a taxa.
  const conciliadas = rows.filter((row) => row.reconciledAt !== null);
  const pagoNasConciliadas = conciliadas.reduce((sum, row) => sum + row.amountCents, 0);
  const entraNasConciliadas = conciliadas.reduce((sum, row) => sum + incomingOf(row), 0);
  const taxas = pagoNasConciliadas - entraNasConciliadas;

  return (
    <section className="card">
      <div className="panel-head">
        <h2 className="card-title">Cobranças pelo gateway</h2>
      </div>
      <p className="field-help">
        O que foi emitido para as famílias. Não entra nos totais acima: receita é o recebimento, não
        a cobrança.
      </p>

      {conciliadas.length > 0 && (
        <div className="stats">
          <Stat
            value={brl(pagoNasConciliadas)}
            label="Clientes pagaram"
            context={`${conciliadas.length} cobrança(s) conciliada(s)`}
          />
          <Stat value={brl(entraNasConciliadas)} label="Entra no caixa" context="líquido" isGo />
          <Stat value={brl(taxas)} label="Taxas do gateway" context="transação + antecipação" />
        </div>
      )}

      <div className="tbl-wrap">
        <div className="tbl tbl-report-charges">
          <div className="tbl-row tbl-head">
            <span>Emitida</span>
            <span>Família</span>
            <span>Saída</span>
            <span>Forma</span>
            <span className="col-num">Cliente paga</span>
            <span className="col-num">Esperado</span>
            <span className="col-num">Entra</span>
          </div>

          {rows.map((row) => (
            <div key={row.id} className="tbl-row">
              <span className="mono">{formatDate(row.createdAt)}</span>
              <span className="cell-name">{row.responsibleName}</span>
              <span className="cell-name">{row.groupName}</span>
              <span>
                {billingLabel(row.billingType)}
                {row.installments > 1 ? ` ${row.installments}x` : ''}
              </span>
              <span className="col-num mono">{brl(row.amountCents)}</span>
              <span className="col-num mono">{brl(row.netAmountCents)}</span>
              <span className="col-num mono">
                {row.reconciledAt === null ? (
                  <span className="nf nf-off">—</span>
                ) : (
                  brl(incomingOf(row))
                )}
              </span>
            </div>
          ))}

          <div className="tbl-row tbl-foot">
            <span>Totais</span>
            <span />
            <span />
            <span />
            <span className="col-num mono">{brl(totalCobrado)}</span>
            <span className="col-num mono">{brl(totalEsperado)}</span>
            <span className="col-num mono">{brl(totalEntra)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/** O que entra por esta cobrança: o que já caiu mais o que está a caminho. */
/**
 * Bloco da faixa de estatísticas. Verde só onde o número **é** dinheiro que entrou —
 * taxa é custo, e custo não é vermelho nem verde: é cinza (cor é dado, §1).
 */
function Stat({
  value,
  label,
  context,
  isGo,
}: {
  value: string;
  label: string;
  context: string;
  isGo?: boolean;
}): React.JSX.Element {
  return (
    <div className="stat">
      <span className={`stat-num${isGo ? ' is-go' : ''}`}>
        <span className="stat-unit">R$</span>
        {value}
      </span>
      <span className="stat-label">{label}</span>
      <span className="stat-context">{context}</span>
    </div>
  );
}

function incomingOf(row: ChargeReportRow): number {
  return (row.settledNetCents ?? 0) + (row.awaitingCreditCents ?? 0);
}

function billingLabel(billingType: string): string {
  if (billingType === 'BOLETO') return 'Boleto';
  if (billingType === 'CREDIT_CARD') return 'Cartão';
  return 'Pix';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

function brl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
