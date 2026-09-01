-- PG-07 · Aprovado não é creditado.
--
-- Bug encontrado em teste real: o cartão aprovado hoje (`CONFIRMED` no provedor) só vira
-- dinheiro na data de crédito — D+30, ou dois dias úteis quando antecipado. A conciliação
-- contava aprovação como recebimento e dizia que entrou dinheiro que não entrou.
--
-- Passa a guardar os dois lados: o que já caiu e o que está aprovado esperando.
ALTER TABLE "payment_charges" ADD COLUMN "awaiting_credit_cents" BIGINT;
ALTER TABLE "payment_charges" ADD COLUMN "credited_installments" INTEGER;
ALTER TABLE "payment_charges" ADD COLUMN "next_credit_date" DATE;

-- O que foi conciliado com a regra antiga vira null: era aprovado lido como recebido, e
-- número errado guardado é pior do que número ausente. A próxima conciliação repõe.
UPDATE "payment_charges"
SET "settled_net_cents" = NULL, "settled_gross_cents" = NULL, "reconciled_at" = NULL
WHERE "reconciled_at" IS NOT NULL;
