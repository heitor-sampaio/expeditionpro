import { parseLocalDate, type LocalDate } from '../date/localDate.js';

/**
 * PG-01 — mapeia o webhook do ASAAS para o vocabulário daqui. Irmão do
 * `mapWpFlatPayload`: recebe corpo arbitrário e devolve fato, sem I/O e sem exceção.
 *
 * **Nada aqui lança.** Um evento que o provedor inventar amanhã, ou um corpo torto,
 * viram `ignored` — o webhook responde 200 e a vida segue. Erro de mapeamento não pode
 * fazer o ASAAS reenviar em laço.
 *
 * A fronteira entre `received` e `status` é a que importa para o dinheiro: só
 * `PAYMENT_RECEIVED` é caixa (§3.5 — confirmação vem do dinheiro). `CONFIRMED` é o
 * cartão aprovado que ainda não caiu na conta: muda o estado da cobrança, não o ledger.
 */

export type AsaasChargeStatus =
  'pending' | 'confirmed' | 'received' | 'overdue' | 'refunded' | 'cancelled';

export type AsaasEvent =
  | {
      readonly kind: 'received';
      readonly chargeExternalId: string;
      /**
       * Id do **parcelamento**, quando a cobrança é parcelada. O provedor manda um evento
       * por parcela, cada uma com id próprio; é por este que a cobrança daqui é achada.
       */
      readonly installmentExternalId: string | null;
      readonly amountCents: number;
      readonly method: 'pix' | 'boleto' | 'card';
      readonly paidAt: LocalDate;
    }
  | {
      readonly kind: 'status';
      readonly chargeExternalId: string;
      readonly installmentExternalId: string | null;
      readonly status: AsaasChargeStatus;
    }
  | { readonly kind: 'ignored' };

const IGNORED = { kind: 'ignored' } as const;

/** Eventos que só mexem no estado da cobrança. */
const STATUS_EVENTS: Record<string, AsaasChargeStatus> = {
  PAYMENT_CONFIRMED: 'confirmed',
  PAYMENT_OVERDUE: 'overdue',
  PAYMENT_REFUNDED: 'refunded',
  PAYMENT_DELETED: 'cancelled',
  PAYMENT_RESTORED: 'pending',
};

export function mapAsaasEvent(body: unknown): AsaasEvent {
  const envelope = body as { event?: unknown; payment?: unknown } | null | undefined;
  if (!envelope || typeof envelope !== 'object') return IGNORED;

  const event = typeof envelope.event === 'string' ? envelope.event : null;
  const payment = envelope.payment as
    | {
        id?: unknown;
        installment?: unknown;
        value?: unknown;
        billingType?: unknown;
        dueDate?: unknown;
        paymentDate?: unknown;
      }
    | null
    | undefined;
  if (!event || !payment || typeof payment !== 'object') return IGNORED;

  const chargeExternalId = typeof payment.id === 'string' ? payment.id : null;
  if (!chargeExternalId) return IGNORED;

  const installmentExternalId =
    typeof payment.installment === 'string' ? payment.installment : null;

  const status = STATUS_EVENTS[event];
  if (status) return { kind: 'status', chargeExternalId, installmentExternalId, status };
  if (event !== 'PAYMENT_RECEIVED') return IGNORED;

  const amountCents = toCents(payment.value);
  const paidAt = toDate(payment.paymentDate) ?? toDate(payment.dueDate);
  if (amountCents === null || paidAt === null) return IGNORED;

  return {
    kind: 'received',
    chargeExternalId,
    installmentExternalId,
    amountCents,
    method: methodOf(payment.billingType),
    paidAt,
  };
}

/**
 * Reais decimais viram centavos por arredondamento: `19.99 * 100` dá 1998.9999999 em
 * ponto flutuante, e um centavo perdido é divergência de ledger.
 */
function toCents(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

function toDate(value: unknown): LocalDate | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return parseLocalDate(value);
}

/**
 * A forma de pagamento do provedor vira método do ledger. Forma que não conhecemos ainda
 * é dinheiro que entrou: cai em `pix` (o meio dominante aqui) em vez de descartar o
 * recebimento — a equipe corrige o método se precisar, mas o valor não some.
 */
function methodOf(billingType: unknown): 'pix' | 'boleto' | 'card' {
  if (billingType === 'BOLETO') return 'boleto';
  if (billingType === 'CREDIT_CARD' || billingType === 'DEBIT_CARD') return 'card';
  return 'pix';
}
