-- AU-25 — o contexto como o gatilho o entregou, para ensaiar em cima do que já aconteceu.
--
-- `variables` é sobrescrito a cada passo pelo motor: guarda o estado de agora, não o do começo.
-- Ensaiar a partir dele mostraria o contexto do meio do caminho com a cara de ser fiel à
-- execução — e uma resposta errada que parece certa é pior que resposta nenhuma.
--
-- **NULL de propósito, sem default e sem backfill.** NULL quer dizer "execução anterior a este
-- campo"; `{}` quer dizer "o gatilho não trouxe nada", que é legítimo. Colapsar os dois faria a
-- lista de execuções mentir sobre o motivo de uma delas não servir para ensaiar. E copiar
-- `variables` para cá no backfill poria o estado final numa coluna cujo contrato é "estado
-- inicial" — depois disso, nunca mais dá para distinguir uma coisa da outra.
--
-- A RLS de `automation_runs` já vale para a coluna nova: policy é da tabela, não do campo.
ALTER TABLE "automation_runs" ADD COLUMN "trigger_variables" jsonb;

-- Para voltar atrás: nada depende desta coluna fora do ensaio.
--   ALTER TABLE "automation_runs" DROP COLUMN "trigger_variables";
