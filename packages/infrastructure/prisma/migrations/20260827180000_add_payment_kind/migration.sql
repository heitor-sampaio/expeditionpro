-- §3.6: natureza do lançamento de recebimento.
--   payment  = entrada de dinheiro (o que já existia)
--   refund   = devolução em dinheiro ao cliente
--   cashback = valor convertido em crédito do cliente (nem receita, nem despesa)
--
-- Devolução e conversão são gravadas com amount_cents NEGATIVO: o ledger continua
-- imutável (o recebimento original permanece) e toda soma de "recebido" já sai líquida.
-- Reversível: DROP COLUMN "kind".
ALTER TABLE "booking_payments"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'payment';

CREATE INDEX "booking_payments_tenant_kind_idx"
  ON "booking_payments" ("tenant_id", "kind");
