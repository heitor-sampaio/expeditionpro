-- PG-04 · Correção do modelo de taxas do cartão.
--
-- O modelo anterior somava um acréscimo **por parcela** (`installmentBps × (n−1)`), o que
-- não é o que o provedor cobra: a taxa da transação é única por venda, e o que cresce com
-- as parcelas é a antecipação — proporcional ao prazo de cada uma. Em 6x isso deu 13,04%
-- onde o custo real era 8,73%, inflando a cobrança em R$ 113.
--
-- Os campos mudaram de significado, então **não dá para converter**: `anticipationBps`
-- era um percentual único e agora é ao mês; `installmentBps` era por parcela e agora é a
-- taxa da venda parcelada. Preserva-se o que não mudou (taxa da transação e taxa fixa) e
-- zera-se o resto, para a equipe preencher com os números do contrato.
UPDATE "payment_integrations"
SET "fee_settings" = jsonb_strip_nulls(
  jsonb_build_object(
    'pix', CASE WHEN "fee_settings" -> 'pix' IS NULL THEN NULL ELSE jsonb_build_object(
      'percentBps', COALESCE("fee_settings" -> 'pix' ->> 'percentBps', '0')::int,
      'fixedCents', COALESCE("fee_settings" -> 'pix' ->> 'fixedCents', '0')::int,
      'anticipationMonthlyBps', 0
    ) END,
    'boleto', CASE WHEN "fee_settings" -> 'boleto' IS NULL THEN NULL ELSE jsonb_build_object(
      'percentBps', COALESCE("fee_settings" -> 'boleto' ->> 'percentBps', '0')::int,
      'fixedCents', COALESCE("fee_settings" -> 'boleto' ->> 'fixedCents', '0')::int,
      'anticipationMonthlyBps', 0
    ) END,
    'card', CASE WHEN "fee_settings" -> 'card' IS NULL THEN NULL ELSE jsonb_build_object(
      'percentBps', COALESCE("fee_settings" -> 'card' ->> 'percentBps', '0')::int,
      'fixedCents', COALESCE("fee_settings" -> 'card' ->> 'fixedCents', '0')::int,
      'installmentPercentBps', 0,
      'anticipationMonthlyBps', 0
    ) END
  )
)
WHERE "fee_settings" IS NOT NULL;
