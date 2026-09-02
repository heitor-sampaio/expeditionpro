-- §5.17 — atendimento: conexão de canal, conversas e mensagens (AT-01..AT-11).

CREATE TABLE "channel_integrations" (
  "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"           UUID NOT NULL,
  "channel"             TEXT NOT NULL,
  "provider"            TEXT NOT NULL,
  "base_url"            TEXT NOT NULL,
  "external_account_id" TEXT NOT NULL,
  -- Cifrado (AES-256-GCM): precisa voltar em claro para chamar a API do provedor.
  "access_token"        TEXT NOT NULL,
  -- Só sha256: este só é comparado, nunca lido de volta.
  "webhook_token_hash"  TEXT NOT NULL,
  "active"              BOOLEAN NOT NULL DEFAULT true,
  "connected_by"        UUID,
  "connected_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "channel_integrations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "channel_integrations_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "channel_integrations_channel_check"
    CHECK ("channel" IN ('whatsapp', 'instagram', 'messenger')),
  CONSTRAINT "channel_integrations_provider_check"
    CHECK ("provider" IN ('evolution', 'meta'))
);

-- Uma conexão por canal: reconectar atualiza, não empilha.
CREATE UNIQUE INDEX "channel_integrations_tenant_id_channel_key"
  ON "channel_integrations"("tenant_id", "channel");

CREATE TABLE "conversations" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"       UUID NOT NULL,
  "channel"         TEXT NOT NULL,
  -- Telefone no WhatsApp; id opaco por aplicativo (PSID/IGSID) no Instagram e no Messenger.
  "channel_user_id" TEXT NOT NULL,
  "display_name"    TEXT,
  "customer_id"     UUID,
  "opportunity_id"  UUID,
  "last_message_at" TIMESTAMPTZ,
  "unread_count"    INTEGER NOT NULL DEFAULT 0,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "conversations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conversations_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "conversations_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "conversations_opportunity_id_fkey"
    FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "conversations_channel_check"
    CHECK ("channel" IN ('whatsapp', 'instagram', 'messenger'))
);

CREATE UNIQUE INDEX "conversations_tenant_id_channel_channel_user_id_key"
  ON "conversations"("tenant_id", "channel", "channel_user_id");
-- A caixa é lida da mais recente para a mais antiga.
CREATE INDEX "conversations_tenant_id_last_message_at_idx"
  ON "conversations"("tenant_id", "last_message_at" DESC);

CREATE TABLE "messages" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"       UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  -- AT-03: id da mensagem no provedor. É a marca de idempotência — todo provedor reenvia
  -- até receber 200, e o unique abaixo é o que impede a repetida de virar linha nova.
  "external_id"     TEXT NOT NULL,
  "direction"       TEXT NOT NULL,
  "body"            TEXT NOT NULL,
  "sent_by_user_id" UUID,
  -- AT-04: corpo cru do webhook, como `intake_events`. Nunca vai para o log da aplicação.
  "payload"         JSONB NOT NULL DEFAULT '{}',
  "sent_at"         TIMESTAMPTZ NOT NULL,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "messages_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "messages_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "messages_direction_check" CHECK ("direction" IN ('in', 'out'))
);

CREATE UNIQUE INDEX "messages_tenant_id_external_id_key"
  ON "messages"("tenant_id", "external_id");
CREATE INDEX "messages_tenant_id_conversation_id_sent_at_idx"
  ON "messages"("tenant_id", "conversation_id", "sent_at");

-- AT-11 — atendimento é **só da equipe**. Sem policy de cliente, de propósito: o portal não
-- ganha chat nesta fase, e o conteúdo aqui é conversa de venda, não do cliente com ele mesmo.
-- Se um dia o portal ganhar uma ponta, entra policy própria, com decisão explícita.
ALTER TABLE "channel_integrations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "channel_integrations"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "conversations"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "messages"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

-- AT-09 — a caixa atualiza sozinha.
--
-- `REPLICA IDENTITY FULL` é obrigatório: sem ele o Postgres não entrega o DELETE com as
-- colunas, e a RLS do Realtime não consegue decidir quem pode vê-lo. O bloco condicional é
-- porque a publicação `supabase_realtime` não existe no Postgres cru do CI.
ALTER TABLE "conversations" REPLICA IDENTITY FULL;
ALTER TABLE "messages" REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversations'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    END IF;
  END IF;
END $$;
