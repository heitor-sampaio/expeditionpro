-- §5.8 · Realtime do funil de inscrição para as duas audiências.
--
-- 1) O cliente precisa **ler o próprio pedido** para acompanhá-lo ao vivo: o Realtime
--    respeita a RLS, então sem policy o evento simplesmente não chega ao portal e a
--    badge "em análise" só sumia com F5. O escopo é estreito: pedido feito pelo app
--    (`source = 'portal'`) cujo responsável está na própria família. Payload cru de
--    formulário do site continua invisível — é dado operacional da equipe (§8).
CREATE POLICY customer_read ON "intake_events" FOR SELECT
  USING (
    app.current_role() = 'customer'
    AND "tenant_id" = app.current_tenant_id()
    AND "source" = 'portal'
    AND ("payload"->>'headCustomerId') IN (SELECT id::text FROM app.current_family_ids() AS id)
  );

-- 2) REPLICA IDENTITY FULL nas tabelas do funil.
--
--    Em DELETE o WAL só carrega o que a replica identity manda, e com o padrão
--    (chave primária) o Realtime não tem as colunas para avaliar a RLS — resultado:
--    exclusão não é entregue a ninguém. Excluir uma saída é exatamente o caso em que
--    as duas pontas precisam saber. As tabelas são pequenas; o custo em WAL é o preço
--    de a tela não mentir.
ALTER TABLE "bookings" REPLICA IDENTITY FULL;
ALTER TABLE "booking_participants" REPLICA IDENTITY FULL;
ALTER TABLE "booking_payments" REPLICA IDENTITY FULL;
ALTER TABLE "intake_events" REPLICA IDENTITY FULL;
ALTER TABLE "groups" REPLICA IDENTITY FULL;
ALTER TABLE "schedule_events" REPLICA IDENTITY FULL;
ALTER TABLE "cashback_entries" REPLICA IDENTITY FULL;
