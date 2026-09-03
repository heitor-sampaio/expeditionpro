-- AU-17 — três gatilhos que faltavam.
--
-- `message_sent`: o que a equipe manda pela caixa. O eco do provedor **não** entra aqui, e é
-- de propósito (AU-05): se entrasse, a resposta de uma automação dispararia outra, e a classe
-- de "automação que se alimenta" voltaria a existir por uma porta lateral.
--
-- `booking_cancelled`: a inscrição cancelada, com o motivo no contexto.
--
-- `recurring`: de tempos em tempos, sem entidade por trás. É varrido como o temporal, e o que
-- impede o disparo múltiplo é a fatia de tempo virando chave de idempotência — a varredura
-- passa de sessenta em sessenta segundos, e sem isso "a cada seis horas" viraria "a cada
-- minuto".
ALTER TABLE "automations" DROP CONSTRAINT "automations_trigger_type_check";
ALTER TABLE "automations" ADD CONSTRAINT "automations_trigger_type_check"
  CHECK ("trigger_type" IN (
    'message_received',
    'message_sent',
    'conversation_created',
    'opportunity_created',
    'opportunity_moved',
    'booking_created',
    'booking_confirmed',
    'booking_cancelled',
    'payment_registered',
    'scheduled',
    'recurring'
  ));

-- Para voltar atrás: desligar e limpar as automações dos três tipos novos antes de restaurar
-- a lista anterior, senão o CHECK não valida as linhas que já existem.
--   UPDATE "automations" SET "enabled" = false, "trigger_type" = NULL
--    WHERE "trigger_type" IN ('message_sent', 'booking_cancelled', 'recurring');
