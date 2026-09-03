-- §5.18 — o motor: a execução e o log dela (AU-04, AU-06, AU-11, AU-12).

-- AU-12: o gatilho temporal. Dispara em relação à data de início de uma saída, e é varrido em
-- vez de agendado — despertador perde o disparo quando o processo está fora do ar; "o que está
-- vencido?" continua verdadeiro quando ele volta.
ALTER TABLE "automations" DROP CONSTRAINT "automations_trigger_type_check";
ALTER TABLE "automations" ADD CONSTRAINT "automations_trigger_type_check"
  CHECK ("trigger_type" IN (
    'message_received',
    'conversation_created',
    'opportunity_created',
    'opportunity_moved',
    'booking_created',
    'booking_confirmed',
    'payment_registered',
    'scheduled'
  ));

-- A configuração do gatilho: quantos dias antes ou depois da saída, no caso do temporal. Os
-- gatilhos de evento não têm o que configurar e deixam o objeto vazio.
ALTER TABLE "automations" ADD COLUMN "trigger_config" JSONB NOT NULL DEFAULT '{}';

CREATE TABLE "automation_runs" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"       UUID NOT NULL,
  "automation_id"   UUID NOT NULL,
  -- O que disparou: ids da conversa, da oportunidade, da inscrição. É o contexto inicial da
  -- execução, e é o que o log mostra quando alguém pergunta "por que essa mensagem saiu?".
  "trigger_ref"     JSONB NOT NULL DEFAULT '{}',
  -- AU-12: a chave que impede disparo duplo. O gatilho temporal é varrido, então a varredura
  -- roda de novo sobre a mesma saída — é esta unique, e não a precisão do relógio, que garante
  -- uma execução só. Gatilho de evento deixa nulo: o evento já aconteceu uma vez.
  "idempotency_key" TEXT,
  "status"          TEXT NOT NULL DEFAULT 'pending',
  -- Onde a execução parou. Nulo quer dizer "ainda não entrou": o próximo é o gatilho.
  "current_node_id" TEXT,
  -- AU-09: o contexto e as variáveis que o fluxo definiu pelo caminho.
  "variables"       JSONB NOT NULL DEFAULT '{}',
  -- Quando esta execução deve ser olhada. Agora, para o disparo imediato; no futuro, quando um
  -- bloco de espera a adormeceu.
  "wake_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- AU-05: teto de passos, para um fluxo torto não andar para sempre.
  "steps_taken"     INTEGER NOT NULL DEFAULT 0,
  -- AU-11: teto de tentativas, e o motivo do que estourou.
  "attempts"        INTEGER NOT NULL DEFAULT 0,
  "last_error"      TEXT,
  -- A reivindicação. Quem carimba `locked_by` primeiro leva a execução; `locked_at` é o que
  -- devolve a linha para a fila quando o processo que a pegou morreu no meio.
  "locked_by"       TEXT,
  "locked_at"       TIMESTAMPTZ,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "automation_runs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "automation_runs_automation_id_fkey"
    FOREIGN KEY ("automation_id") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "automation_runs_status_check" CHECK ("status" IN (
    'pending', 'waiting', 'done', 'failed', 'cancelled'
  ))
);

CREATE UNIQUE INDEX "automation_runs_tenant_id_automation_id_idempotency_key_key"
  ON "automation_runs"("tenant_id", "automation_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
CREATE INDEX "automation_runs_tenant_id_automation_id_created_at_idx"
  ON "automation_runs"("tenant_id", "automation_id", "created_at" DESC);
-- A consulta do motor, e a **única** do sistema que atravessa tenants de propósito: ele roda
-- fora de requisição e pergunta "o que está vencido, em qualquer tenant?". Esse caminho
-- devolve só ids; executar volta ao client escopado, com o tenant da própria linha.
CREATE INDEX "automation_runs_status_wake_at_idx"
  ON "automation_runs"("status", "wake_at") WHERE "status" IN ('pending', 'waiting');

-- AU-06 — o log passo a passo, append-only como a trilha de auditoria. É o que responde
-- "por que essa mensagem foi enviada para esse cliente?", e por isso não tem update nem delete.
CREATE TABLE "automation_run_steps" (
  "id"        UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "run_id"    UUID NOT NULL,
  "node_id"   TEXT NOT NULL,
  "kind"      TEXT NOT NULL,
  -- O que aconteceu naquele nó: por onde saiu, o que decidiu, ou o erro que impediu.
  "outcome"   TEXT NOT NULL,
  "detail"    JSONB NOT NULL DEFAULT '{}',
  "at"        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "automation_run_steps_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "automation_run_steps_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "automation_run_steps_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "automation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "automation_run_steps_tenant_id_run_id_at_idx"
  ON "automation_run_steps"("tenant_id", "run_id", "at");

-- AU-10 — como `automations`: só da equipe. O cliente não vê que a reação existe, e muito
-- menos o log dela, que nomeia decisões tomadas sobre ele.
ALTER TABLE "automation_runs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "automation_runs"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

ALTER TABLE "automation_run_steps" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "automation_run_steps"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');
