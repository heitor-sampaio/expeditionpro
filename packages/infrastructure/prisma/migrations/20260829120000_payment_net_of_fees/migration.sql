-- PG-08 · O ledger registra o que quita a inscrição, não o que passou pela conta.
--
-- A taxa do gateway é **repassada ao cliente** (decisão do dono): ele paga o bruto e a
-- empresa recebe o líquido, já descontado pelo provedor. Lançar o bruto no ledger contava
-- como receita um dinheiro que nunca foi da empresa — e deixava a inscrição "paga a mais"
-- exatamente no valor da taxa.
--
-- `amount_cents` passa a ser o que quita; `customer_paid_cents` guarda o que o cliente
-- pagou, para o extrato dele bater com a fatura.
ALTER TABLE "booking_payments" ADD COLUMN "customer_paid_cents" BIGINT;

-- Liga o recebimento à cobrança que o originou. Sem isto, a proporção entre bruto e
-- líquido teria de ser adivinhada, e a tela precisaria de heurística para saber o que
-- veio do gateway.
ALTER TABLE "booking_payments" ADD COLUMN "charge_id" UUID REFERENCES "payment_charges"("id") ON DELETE SET NULL;

CREATE INDEX "booking_payments_charge_idx" ON "booking_payments" ("tenant_id", "charge_id");
