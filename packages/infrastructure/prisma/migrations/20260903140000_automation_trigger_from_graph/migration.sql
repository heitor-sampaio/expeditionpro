-- AU-14 — o gatilho passa a ser um bloco do quadro, e a coluna vira cópia dele.
--
-- Antes, o gatilho era escolhido num formulário antes de o desenho existir e não mudava mais:
-- trocar de ideia obrigava a apagar a automação e recomeçar. Agora ele é um bloco como os
-- outros, e a coluna — que existe porque cada evento procura por ela em milissegundos, e
-- vasculhar `jsonb` a cada mensagem recebida seria caro à toa — é derivada do desenho a cada
-- salvamento.
--
-- Daí o nulo: enquanto o quadro não tem bloco de gatilho, a automação é rascunho. Rascunho não
-- liga (o desenho é validado ao ligar) e, desligada, nenhum evento a procura.
ALTER TABLE "automations" ALTER COLUMN "trigger_type" DROP NOT NULL;

-- O CHECK continua valendo para o que não é nulo: `IN` com NULL devolve NULL, e o Postgres
-- aceita a linha. É de propósito — o que se quer recusar é gatilho inventado, não rascunho.

-- Para voltar atrás: escolher um gatilho para os rascunhos (todos desligados por definição,
-- então nenhum passa a reagir a nada) e devolver a obrigatoriedade.
--   UPDATE "automations" SET "trigger_type" = 'message_received' WHERE "trigger_type" IS NULL;
--   ALTER TABLE "automations" ALTER COLUMN "trigger_type" SET NOT NULL;
