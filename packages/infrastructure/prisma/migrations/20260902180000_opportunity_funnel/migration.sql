-- §5.16 — o funil de oportunidades (OP-01..11).
--
-- Duas tabelas que vivem **antes** do dinheiro e não encostam nele: nenhum relatório
-- financeiro as lê. `expected_value_cents` é previsão, não caixa (OP-09).

CREATE TABLE "opportunity_stages" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"   UUID NOT NULL,
  "name"        TEXT NOT NULL,
  -- Sem unique de propósito: etapa arquivada guarda a posição dela, e um unique impediria a
  -- ativa seguinte de ocupar aquele número. A coerência vem da reordenação, que reescreve a
  -- ordem inteira numa transação (OP-01).
  "position"    INTEGER NOT NULL,
  "kind"        TEXT NOT NULL DEFAULT 'open',
  "archived_at" TIMESTAMPTZ,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "opportunity_stages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "opportunity_stages_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "opportunity_stages_kind_check" CHECK ("kind" IN ('open', 'won', 'lost'))
);

CREATE UNIQUE INDEX "opportunity_stages_tenant_id_name_key"
  ON "opportunity_stages"("tenant_id", "name");
CREATE INDEX "opportunity_stages_tenant_id_position_idx"
  ON "opportunity_stages"("tenant_id", "position");

CREATE TABLE "opportunities" (
  "id"                   UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"            UUID NOT NULL,
  "stage_id"             UUID NOT NULL,
  "contact_name"         TEXT NOT NULL,
  -- E.164, normalizado na borda. **Sem CPF**: quem pergunta o preço ainda não é cliente, e
  -- `customers` exige CPF com unique por tenant (§4) — é por isso que esta tabela existe.
  "phone"                TEXT,
  "email"                TEXT,
  "itinerary_id"         UUID,
  "customer_id"          UUID,
  -- Preenchido no fechamento (OP-08): presente = virou inscrição e parou de se mover.
  "booking_id"           UUID,
  "expected_value_cents" BIGINT,
  "source"               TEXT NOT NULL DEFAULT 'manual',
  "lost_reason"          TEXT,
  "created_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deleted_at"           TIMESTAMPTZ,

  CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "opportunities_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  -- RESTRICT: etapa não se apaga, se arquiva — e arquivar já é bloqueado com cartão dentro.
  CONSTRAINT "opportunities_stage_id_fkey"
    FOREIGN KEY ("stage_id") REFERENCES "opportunity_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "opportunities_itinerary_id_fkey"
    FOREIGN KEY ("itinerary_id") REFERENCES "itineraries"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "opportunities_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "opportunities_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "opportunities_source_check"
    CHECK ("source" IN ('manual', 'whatsapp', 'instagram', 'messenger', 'site'))
);

CREATE INDEX "opportunities_tenant_id_stage_id_idx" ON "opportunities"("tenant_id", "stage_id");
-- AT-06: a chegada de mensagem procura oportunidade pelo telefone.
CREATE INDEX "opportunities_tenant_id_phone_idx" ON "opportunities"("tenant_id", "phone");

-- OP-11 — o funil é **só da equipe**. Sem policy de cliente, de propósito: o cliente não vê
-- funil, não vê etapa e não sabe que existe. Se um dia o portal ganhar alguma vista disso,
-- entra uma policy `FOR SELECT` própria, com decisão explícita.
ALTER TABLE "opportunity_stages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "opportunity_stages"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

ALTER TABLE "opportunities" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "opportunities"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');

-- OP-02 — todo tenant existente nasce com um funil de pé.
--
-- Quadro que abre vazio não é usado: quem chega numa tela com zero colunas não descobre que
-- precisa configurar etapas antes de criar cartão. As cinco abaixo são o caminho de venda da
-- Drakkar e servem como ponto de partida para renomear, não como regra fixa.
--
-- `Fechado` é `won` e `Perdido` é `lost`: os dois são terminais e é deles que sai a conversão.
INSERT INTO "opportunity_stages" ("tenant_id", "name", "position", "kind")
SELECT t."id", padrao.name, padrao.position, padrao.kind
FROM "tenants" t
CROSS JOIN (
  VALUES
    ('Novo', 0, 'open'),
    ('Conversando', 1, 'open'),
    ('Proposta enviada', 2, 'open'),
    ('Fechado', 3, 'won'),
    ('Perdido', 4, 'lost')
) AS padrao(name, position, kind)
ON CONFLICT ("tenant_id", "name") DO NOTHING;
