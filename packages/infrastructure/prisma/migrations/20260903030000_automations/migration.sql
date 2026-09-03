-- §5.18 — automações: o desenho e o estado (AU-01, AU-02, AU-03, AU-10).

CREATE TABLE "automations" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"     UUID NOT NULL,
  "name"          TEXT NOT NULL,
  "description"   TEXT,
  -- Qual acontecimento a acorda. Fica em coluna própria, e não só dentro do grafo, porque é
  -- por ela que o gatilho procura quem tem interesse a cada evento.
  "trigger_type"  TEXT NOT NULL,
  -- AU-01: o grafo inteiro — nós, ligações e posição no quadro. O domínio valida antes de
  -- gravar; o banco guarda o desenho como ele é.
  "graph"         JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  -- AU-02: nasce desligada, sempre. Ligar é ato explícito de owner ou admin, e é o momento em
  -- que ela passa a agir sobre gente de verdade.
  "enabled"       BOOLEAN NOT NULL DEFAULT false,
  -- AU-03: a automação age **como esta pessoa**, e o papel dela é relido a cada execução.
  -- Quem perdeu acesso não age por procuração.
  "run_as_user_id" UUID,
  "created_by"    UUID,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Automação que já rodou deixou rastro em conversa e em ficha de cliente: apagar de verdade
  -- tiraria o "por quê" de coisas que aconteceram.
  "deleted_at"    TIMESTAMPTZ,

  CONSTRAINT "automations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "automations_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "automations_trigger_type_check" CHECK ("trigger_type" IN (
    'message_received',
    'conversation_created',
    'opportunity_created',
    'opportunity_moved',
    'booking_created',
    'booking_confirmed',
    'payment_registered'
  ))
);

-- Nome é como a equipe se refere à automação numa conversa: dois iguais viram engano.
CREATE UNIQUE INDEX "automations_tenant_id_name_key"
  ON "automations"("tenant_id", "name") WHERE "deleted_at" IS NULL;
-- A consulta do gatilho: a cada evento, quem está ligada para ele.
CREATE INDEX "automations_tenant_id_trigger_type_idx"
  ON "automations"("tenant_id", "trigger_type") WHERE "enabled" AND "deleted_at" IS NULL;

-- AU-10 — automação é **só da equipe**. Sem policy de cliente, como o atendimento (AT-11):
-- quem desenha as reações da empresa é a empresa, e o cliente não sabe que elas existem.
ALTER TABLE "automations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "automations"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');
