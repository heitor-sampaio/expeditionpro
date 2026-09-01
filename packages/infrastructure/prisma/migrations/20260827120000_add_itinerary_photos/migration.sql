-- §3.5 · RO-01: galeria de fotos do roteiro. Até 10 por roteiro, uma capa (índice parcial
-- único). Storage privado por tenant guarda o arquivo; aqui fica só o path e a ordem.

CREATE TABLE "itinerary_photos" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "itinerary_id" UUID NOT NULL,
    "storage_path" TEXT NOT NULL,
    "alt" TEXT,
    "position" INTEGER NOT NULL,
    "is_cover" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "itinerary_photos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "itinerary_photos_tenant_id_itinerary_id_idx" ON "itinerary_photos"("tenant_id", "itinerary_id");
-- No máximo uma capa por roteiro.
CREATE UNIQUE INDEX "itinerary_photos_cover_unique" ON "itinerary_photos"("itinerary_id") WHERE "is_cover";

ALTER TABLE "itinerary_photos" ADD CONSTRAINT "itinerary_photos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "itinerary_photos" ADD CONSTRAINT "itinerary_photos_itinerary_id_fkey" FOREIGN KEY ("itinerary_id") REFERENCES "itineraries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS por audiência (§2.2 · SEC-01): equipe tem tudo do tenant; o cliente lê a galeria dos
-- roteiros ATIVOS do seu tenant (navega o catálogo). Escrita é só da equipe.
ALTER TABLE "itinerary_photos" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "itinerary_photos"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');
CREATE POLICY customer_read ON "itinerary_photos" FOR SELECT
  USING (
    app.current_role() = 'customer'
    AND "tenant_id" = app.current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM itineraries i
      WHERE i.id = itinerary_photos.itinerary_id
        AND i.tenant_id = app.current_tenant_id()
        AND i.status = 'active'
    )
  );
