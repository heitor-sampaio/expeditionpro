-- PG-04 · Taxas do provedor e o líquido da cobrança.
--
-- As taxas são do contrato do tenant com o ASAAS (variam por conta e por forma de
-- pagamento), então são **configuração**, não constante de código. Ficam junto da
-- conexão, por ambiente: sandbox e produção podem ter condições diferentes.
ALTER TABLE "payment_integrations" ADD COLUMN "fee_settings" JSONB;

-- O que a empresa quer receber. `amount_cents` é o que o cliente paga (bruto); este é o
-- que deve sobrar depois das taxas. Guardar os dois deixa a conferência possível meses
-- depois, quando a taxa negociada já for outra.
ALTER TABLE "payment_charges" ADD COLUMN "net_amount_cents" BIGINT;
ALTER TABLE "payment_charges" ADD COLUMN "installments" INTEGER NOT NULL DEFAULT 1;
