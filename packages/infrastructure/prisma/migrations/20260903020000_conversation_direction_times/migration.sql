-- AT-07 — dois horários, porque são duas perguntas diferentes.
--
-- "Ele já respondeu?" e "nós já respondemos?" não se respondem com o mesmo carimbo. Com um
-- horário só, uma conversa em que a equipe acabou de escrever parece igual a uma em que o
-- cliente acabou de cobrar — e é justamente a segunda que precisa de alguém.
--
-- `last_message_at` continua existindo como "última atividade": é por onde a caixa ordena, e
-- ordenar pelo maior entre duas colunas não usa índice.

ALTER TABLE "conversations"
  ADD COLUMN "last_inbound_at"  TIMESTAMPTZ,
  ADD COLUMN "last_outbound_at" TIMESTAMPTZ;

-- As conversas que já existem têm o histórico completo em `messages`: dá para reconstruir os
-- dois carimbos sem perder nada.
UPDATE "conversations" c
SET "last_inbound_at" = t.entrada,
    "last_outbound_at" = t.saida
FROM (
  SELECT conversation_id,
         max(sent_at) FILTER (WHERE direction = 'in')  AS entrada,
         max(sent_at) FILTER (WHERE direction = 'out') AS saida
  FROM "messages"
  GROUP BY conversation_id
) t
WHERE t.conversation_id = c.id;
