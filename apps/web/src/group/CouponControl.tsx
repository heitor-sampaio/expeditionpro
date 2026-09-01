import type { BoardRow } from './useGroupBoard.js';

/**
 * CP-05 — o cupom da inscrição, **só leitura**, dentro da linha expandida da mesa.
 *
 * O cupom é desconto que o **cliente** resgata: a casa gera o código em Promoções e
 * entrega, e ele entra no ato em que o cliente se inscreve e paga. A equipe nunca aplica
 * cupom à mão — o desconto que a casa dá é o override de preço, logo abaixo, que baixa o
 * contratado com motivo registrado. Duas portas para a mesma coisa seria uma delas usada
 * errado.
 *
 * O bloco existe mesmo assim porque o número precisa de causa: sem ele, a inscrição
 * aparece valendo menos que a tabela e nada na tela diz por quê.
 *
 * Desconto **não é status financeiro**: nada de verde nem vermelho aqui. O código sai
 * em pill neutra e o abatimento em mono, do mesmo jeito que qualquer outro número.
 */
export function CouponControl({ row }: { row: BoardRow }): React.JSX.Element | null {
  if (!row.coupon) return null;

  return (
    <div className="rowpanel-block">
      <span className="rowpanel-title">Cupom</span>
      <div className="coupon-line">
        <span className="pill pill-neutral">{row.coupon.code}</span>
        <span className="coupon-amount">− {formatBRL(row.coupon.discountCents)}</span>
      </div>
    </div>
  );
}

function formatBRL(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}
