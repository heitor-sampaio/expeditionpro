-- PG-07 · Conciliação: o que o provedor de fato creditou.
--
-- `amount_cents` é o que foi cobrado e `net_amount_cents` o que se esperava receber. Estes
-- são o **realizado**, lido do provedor: quanto o cliente pagou e quanto caiu na conta
-- depois das taxas e da antecipação. Guardar os dois lados é o que permite conferir.
ALTER TABLE "payment_charges" ADD COLUMN "settled_gross_cents" BIGINT;
ALTER TABLE "payment_charges" ADD COLUMN "settled_net_cents" BIGINT;
ALTER TABLE "payment_charges" ADD COLUMN "anticipation_fee_cents" BIGINT;
ALTER TABLE "payment_charges" ADD COLUMN "paid_installments" INTEGER;
ALTER TABLE "payment_charges" ADD COLUMN "reconciled_at" TIMESTAMP(3);
