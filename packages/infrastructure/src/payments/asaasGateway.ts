import { OUTBOUND_TIMEOUT_MS } from '../outbound.js';
import type {
  GatewayAccount,
  GatewaySettlement,
  SettlementRef,
  GatewayQuote,
  GatewaySimulation,
  GatewayCharge,
  GatewayChargeInput,
  GatewayCredentials,
  PaymentGateway,
} from '@expedition/application';
import { parseLocalDate, type LocalDate } from '@expedition/domain';

/**
 * PG-01/PG-02 — o ASAAS de verdade, por HTTP. Único lugar do sistema que conhece o
 * formato da API deles; tudo acima fala o vocabulário daqui.
 *
 * Duas coisas que a API deles impõe e ficam contidas aqui:
 *
 * - **Valor em reais decimais.** Convertemos de centavos na saída e o mapeador converte
 *   de volta na entrada. Centavo é a unidade do sistema; real com vírgula é detalhe do
 *   provedor (§3.4).
 * - **Cliente antes da cobrança.** Não dá para cobrar um CPF solto: primeiro se busca ou
 *   cria o cliente lá, depois se cobra o id dele. Os dois passos vivem em `createCharge`,
 *   porque para quem chama é uma operação só.
 */

const HOSTS: Record<string, string> = {
  sandbox: 'https://api-sandbox.asaas.com/v3',
  production: 'https://api.asaas.com/v3',
};

interface AsaasCustomer {
  readonly id: string;
}

interface AsaasPayment {
  readonly id: string;
  readonly installment?: string | null;
  readonly invoiceUrl?: string | null;
  readonly status?: string;
}

export function asaasGateway(
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = OUTBOUND_TIMEOUT_MS,
): PaymentGateway {
  const call = async (
    credentials: GatewayCredentials,
    path: string,
    init?: { method: string; body: unknown },
  ): Promise<{ ok: boolean; status: number; body: unknown }> => {
    const host = HOSTS[credentials.environment] ?? HOSTS['sandbox']!;
    const response = await fetchImpl(`${host}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        access_token: credentials.accessToken,
        'content-type': 'application/json',
        // O ASAAS pede identificação do integrador nas chamadas de produção.
        'User-Agent': 'ExpeditionPRO',
      },
      ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
      // SEC: sem sinal, `fetch` espera para sempre. Ver `OUTBOUND_TIMEOUT_MS`.
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body: unknown = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, body };
  };

  return {
    /**
     * PG-05 — `POST /payments/simulate`: o próprio provedor diz quanto cobra por esta
     * venda, já na faixa certa de parcelas. Melhor do que reproduzir a tabela de preços,
     * que é negociada por conta e muda com o tempo.
     */
    async simulate(
      credentials: GatewayCredentials,
      simulation: GatewaySimulation,
    ): Promise<GatewayQuote | null> {
      const result = await call(credentials, '/payments/simulate', {
        method: 'POST',
        body: {
          value: toReais(simulation.valueCents),
          billingTypes: [simulation.billingType],
          ...(simulation.installments > 1 ? { installmentCount: simulation.installments } : {}),
        },
      });
      if (!result.ok) return null;

      const body = result.body as {
        creditCard?: { feePercentage?: number | null; operationFee?: number | null } | null;
        bankSlip?: { feeValue?: number | null } | null;
        pix?: { feeValue?: number | null; feePercentage?: number | null } | null;
      } | null;

      if (simulation.billingType === 'CREDIT_CARD') {
        const card = body?.creditCard;
        if (!card) return null;
        return {
          percentBps: toBps(card.feePercentage),
          fixedCents: toCents(card.operationFee),
        };
      }
      const slip = simulation.billingType === 'BOLETO' ? body?.bankSlip : body?.pix;
      if (!slip) return null;
      return {
        percentBps: toBps((slip as { feePercentage?: number | null }).feePercentage),
        fixedCents: toCents(slip.feeValue),
      };
    },

    /**
     * PG-07 — o realizado desta cobrança. Numa venda parcelada, o provedor guarda uma
     * cobrança por parcela: soma-se o que já foi pago e o líquido de cada uma.
     *
     * `netValue` do provedor é líquido **da transação**. A antecipação, quando existe,
     * vem de `/anticipations` — e é subtraída à parte, porque tem custo próprio.
     */
    /**
     * PG-07 — o realizado desta cobrança. Numa venda parcelada o provedor guarda uma
     * cobrança por parcela, e **uma antecipação por parcela** quando elas são antecipadas.
     *
     * A antecipação é a fonte melhor: ela traz o `netValue` exato que vai entrar naquela
     * parcela, com o custo já descontado e proporcional aos dias antecipados. Onde ela
     * existe, é ela que manda; onde não existe, vale o `netValue` da própria parcela.
     */
    async fetchSettlement(
      credentials: GatewayCredentials,
      ref: SettlementRef,
    ): Promise<GatewaySettlement | null> {
      const payments = await loadPayments(call, credentials, ref);
      if (!payments) return null;

      const paid = payments.filter(
        (payment) => isCredited(payment.status) || payment.status === CONFIRMED,
      );
      const anticipations = await loadAnticipations(call, credentials, paid);

      let creditedCents = 0;
      let awaitingCreditCents = 0;
      let creditedInstallments = 0;
      let anticipationFeeCents = 0;

      for (const payment of paid) {
        const anticipation = payment.id ? anticipations.get(payment.id) : undefined;
        if (anticipation) {
          // Antecipada: entra o líquido da antecipação, de uma vez, quando ela é liberada.
          anticipationFeeCents += toCents(anticipation.fee);
          const value = toCents(anticipation.netValue);
          if (isAnticipationCredited(anticipation.status)) {
            creditedCents += value;
            creditedInstallments += 1;
          } else {
            awaitingCreditCents += value;
          }
          continue;
        }
        // Sem antecipação: cai no prazo normal, pelo líquido da transação.
        const value = toCents(payment.netValue);
        if (isCredited(payment.status)) {
          creditedCents += value;
          creditedInstallments += 1;
        } else {
          awaitingCreditCents += value;
        }
      }

      return {
        paidCents: paid.reduce((sum, payment) => sum + toCents(payment.value), 0),
        creditedCents,
        awaitingCreditCents,
        paidInstallments: paid.length,
        creditedInstallments,
        totalInstallments: payments.length,
        anticipationFeeCents,
        nextCreditDate: nextCreditOf(paid, anticipations),
        installmentExternalId: payments.find((payment) => payment.installment)?.installment ?? null,
      };
    },
    async checkAccount(credentials: GatewayCredentials): Promise<GatewayAccount | null> {
      const result = await call(credentials, '/myAccount/commercialInfo');
      if (!result.ok) return null;
      const info = result.body as { name?: string; companyName?: string; email?: string } | null;
      return { name: info?.companyName || info?.name || info?.email || 'Conta ASAAS' };
    },

    async createCharge(
      credentials: GatewayCredentials,
      input: GatewayChargeInput,
    ): Promise<GatewayCharge> {
      const customerId = await findOrCreateCustomer(call, credentials, input);
      const created = await call(credentials, '/payments', {
        method: 'POST',
        body: {
          customer: customerId,
          billingType: input.billingType,
          // Parcelado: o ASAAS quer o total e o número de parcelas, e divide sozinho.
          ...(input.installments > 1
            ? {
                installmentCount: input.installments,
                totalValue: toReais(input.amountCents),
              }
            : { value: toReais(input.amountCents) }),
          dueDate: isoOf(input.dueDate),
          description: input.description,
          externalReference: input.externalReference,
        },
      });
      if (!created.ok) {
        throw new Error(`ASAAS recusou a cobrança (${created.status}): ${describe(created.body)}`);
      }
      const payment = created.body as AsaasPayment;
      return {
        externalId: payment.id,
        // Parcelado: o id que vale é o do parcelamento — cada parcela tem o seu, e é
        // este que aparece em todas elas.
        installmentExternalId: payment.installment ?? null,
        invoiceUrl: payment.invoiceUrl ?? null,
        status: payment.status ?? 'PENDING',
      };
    },
  };
}

/**
 * O cliente no ASAAS é identificado pelo CPF. Reaproveitar o cadastro existente evita
 * duplicar a mesma família lá a cada cobrança — e é o CPF que liga os dois lados.
 */
async function findOrCreateCustomer(
  call: (
    credentials: GatewayCredentials,
    path: string,
    init?: { method: string; body: unknown },
  ) => Promise<{ ok: boolean; status: number; body: unknown }>,
  credentials: GatewayCredentials,
  input: GatewayChargeInput,
): Promise<string> {
  const found = await call(
    credentials,
    `/customers?cpfCnpj=${encodeURIComponent(input.customer.cpf)}`,
  );
  if (found.ok) {
    const list = found.body as { data?: AsaasCustomer[] } | null;
    const first = list?.data?.[0];
    if (first?.id) return first.id;
  }

  const created = await call(credentials, '/customers', {
    method: 'POST',
    body: {
      name: input.customer.name,
      cpfCnpj: input.customer.cpf,
      email: input.customer.email ?? undefined,
      mobilePhone: input.customer.phone ?? undefined,
    },
  });
  if (!created.ok) {
    throw new Error(`ASAAS recusou o cliente (${created.status}): ${describe(created.body)}`);
  }
  return (created.body as AsaasCustomer).id;
}

type Call = (
  credentials: GatewayCredentials,
  path: string,
  init?: { method: string; body: unknown },
) => Promise<{ ok: boolean; status: number; body: unknown }>;

interface AsaasPaymentRow {
  readonly id?: string;
  readonly status?: string;
  readonly value?: number | null;
  readonly netValue?: number | null;
  readonly installment?: string | null;
  readonly creditDate?: string | null;
  readonly estimatedCreditDate?: string | null;
}

const CONFIRMED = 'CONFIRMED';

interface AsaasAnticipation {
  readonly payment?: string | null;
  readonly status?: string;
  readonly fee?: number | null;
  readonly netValue?: number | null;
  readonly dueDate?: string | null;
  readonly anticipationDate?: string | null;
}

/**
 * As antecipações destas parcelas, indexadas pelo id da parcela. O provedor lista todas
 * as da conta; o filtro é nosso, porque o campo `installment` vem vazio nelas.
 *
 * Recusada ou cancelada não conta: a parcela volta a cair no prazo normal.
 */
async function loadAnticipations(
  call: Call,
  credentials: GatewayCredentials,
  payments: AsaasPaymentRow[],
): Promise<Map<string, AsaasAnticipation>> {
  const wanted = new Set(payments.map((payment) => payment.id).filter(Boolean));
  const found = new Map<string, AsaasAnticipation>();
  if (wanted.size === 0) return found;

  const result = await call(credentials, '/anticipations?limit=100');
  if (!result.ok) return found;

  const rows = (result.body as { data?: AsaasAnticipation[] } | null)?.data ?? [];
  for (const row of rows) {
    if (!row.payment || !wanted.has(row.payment)) continue;
    if (row.status === 'DENIED' || row.status === 'CANCELLED') continue;
    found.set(row.payment, row);
  }
  return found;
}

/**
 * Antecipação já creditada. `PENDING` e `SCHEDULED` são pedido em análise ou agendado —
 * o dinheiro ainda não caiu. O resto (aprovada, creditada) é dinheiro na conta.
 */
function isAnticipationCredited(status: string | undefined): boolean {
  return status !== 'PENDING' && status !== 'SCHEDULED';
}

/** A data em que o provedor espera creditar o próximo valor: da antecipação, se houver. */
function nextCreditOf(
  paid: AsaasPaymentRow[],
  anticipations: Map<string, AsaasAnticipation>,
): LocalDate | null {
  const dates: string[] = [];
  for (const payment of paid) {
    const anticipation = payment.id ? anticipations.get(payment.id) : undefined;
    const date = anticipation
      ? (anticipation.anticipationDate ?? anticipation.dueDate)
      : (payment.creditDate ?? payment.estimatedCreditDate);
    if (isIsoDate(date)) dates.push(date);
  }
  const first = dates.sort()[0];
  return first ? parseLocalDate(first) : null;
}

/** Data no formato do provedor. Constante única: regex duplicado é regex que diverge. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE.test(value);
}
/** Parcelado: as parcelas do parcelamento. À vista: a própria cobrança, numa lista de um. */
async function loadPayments(
  call: Call,
  credentials: GatewayCredentials,
  ref: SettlementRef,
): Promise<AsaasPaymentRow[] | null> {
  if (ref.installmentExternalId) {
    const result = await call(credentials, `/installments/${ref.installmentExternalId}/payments`);
    if (!result.ok) return null;
    return (result.body as { data?: AsaasPaymentRow[] } | null)?.data ?? [];
  }
  const result = await call(credentials, `/payments/${ref.externalId}`);
  if (!result.ok) return null;
  return [result.body as AsaasPaymentRow];
}

/**
 * Dinheiro que **entrou na conta**: só `RECEIVED`. `CONFIRMED` é cartão aprovado
 * aguardando a data de crédito — pagamento do cliente, ainda não caixa da empresa.
 */
function isCredited(status: string | undefined): boolean {
  return status === 'RECEIVED' || status === 'RECEIVED_IN_CASH';
}

/** Percentual decimal do provedor (2.49) → basis points (249). */
function toBps(percent: number | null | undefined): number {
  return typeof percent === 'number' && Number.isFinite(percent) ? Math.round(percent * 100) : 0;
}

/** Reais decimais → centavos. */
function toCents(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) : 0;
}

/** Centavos → reais decimais, a unidade que a API deles aceita. */
function toReais(amountCents: number): number {
  return Number((amountCents / 100).toFixed(2));
}

function isoOf(date: LocalDate): string {
  const mm = String(date.month).padStart(2, '0');
  const dd = String(date.day).padStart(2, '0');
  return `${date.year}-${mm}-${dd}`;
}

/** A mensagem de erro do ASAAS, para o log — sem despejar o corpo inteiro. */
function describe(body: unknown): string {
  const errors = (body as { errors?: { description?: string }[] } | null)?.errors;
  return errors?.[0]?.description ?? 'sem detalhe';
}
