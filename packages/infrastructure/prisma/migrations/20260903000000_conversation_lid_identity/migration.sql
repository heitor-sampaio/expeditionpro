-- AT-05 — a identidade do contato no WhatsApp, no meio da migração para o LID.
--
-- O WhatsApp está trocando o endereçamento por telefone (`@s.whatsapp.net`) pelo LID (`@lid`),
-- um id da conta que não é o número. Durante a transição o mesmo contato chega ora por um,
-- ora por outro — e sem guardar os dois, cada forma abriria uma conversa própria: a equipe
-- responderia num fio e o cliente leria o outro.
--
-- `channel_user_id` passa a ser a identidade (LID quando existe), e `phone` guarda o número.
-- O número continua sendo necessário para três coisas: discar, casar com a ficha do cliente
-- (AT-06) e ser reconhecido por gente — ninguém identifica um contato por um LID.

ALTER TABLE "conversations" ADD COLUMN "phone" TEXT;

-- As conversas que já existem foram criadas com o telefone como identidade: é o que a
-- instância mandava antes de o LID aparecer.
UPDATE "conversations" SET "phone" = "channel_user_id" WHERE "channel" = 'whatsapp';

-- A busca acontece pelas duas formas a cada mensagem recebida.
CREATE INDEX "conversations_tenant_id_channel_phone_idx"
  ON "conversations"("tenant_id", "channel", "phone");
