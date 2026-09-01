-- PG-03 · O parcelamento tem um id, e cada parcela tem o seu.
--
-- Bug encontrado em uso: guardávamos só o id da **primeira parcela**, mas o provedor
-- manda um webhook por parcela, cada uma com id próprio. As parcelas 2..n não achavam a
-- cobrança e o recebimento delas nunca entrava no ledger — a inscrição ficaria paga pela
-- fração de uma parcela.
--
-- Guardando o id do parcelamento, qualquer parcela encontra a cobrança que a originou.
ALTER TABLE "payment_charges" ADD COLUMN "installment_external_id" TEXT;

CREATE INDEX "payment_charges_installment_idx"
  ON "payment_charges" ("tenant_id", "installment_external_id");
