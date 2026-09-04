-- AU-21 — o gatilho de webhook: alguém de fora bate numa URL e a automação daquele gancho roda.
--
-- Autentica pela API key do tenant, com escopo próprio (`automation:trigger`), no mesmo desenho
-- do webhook de inscrições: chave revogável na tela, 401 uniforme, rate limit por chave.
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
    'recurring',
    'webhook_received'
  ));

-- Para voltar atrás: desligar e limpar as automações de gancho antes de restaurar a lista.
--   UPDATE "automations" SET "enabled" = false, "trigger_type" = NULL
--    WHERE "trigger_type" = 'webhook_received';
