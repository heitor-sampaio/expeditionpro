-- §5.12 · CO-*: comunidade fechada, por tenant. Posts (foto com legenda), curtidas,
-- comentários e denúncias. O post publica direto (CO-07); a moderação é reativa (CO-08).

CREATE TABLE "posts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "author_customer_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "itinerary_id" UUID,
    "group_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'published',
    "removed_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "post_media" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "storage_path" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'image',
    "position" INTEGER NOT NULL,
    "alt" TEXT,
    CONSTRAINT "post_media_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "post_likes" (
    "tenant_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "post_likes_pkey" PRIMARY KEY ("post_id", "customer_id")
);
CREATE TABLE "post_comments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "author_customer_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'published',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "post_comments_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "post_reports" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "post_id" UUID,
    "comment_id" UUID,
    "reporter_customer_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolved_by" UUID,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "post_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "posts_tenant_id_status_created_at_idx" ON "posts"("tenant_id", "status", "created_at");
CREATE INDEX "posts_tenant_id_itinerary_id_idx" ON "posts"("tenant_id", "itinerary_id");
CREATE INDEX "post_media_post_id_idx" ON "post_media"("post_id");
CREATE INDEX "post_likes_tenant_id_post_id_idx" ON "post_likes"("tenant_id", "post_id");
CREATE INDEX "post_comments_tenant_id_post_id_created_at_idx" ON "post_comments"("tenant_id", "post_id", "created_at");
CREATE INDEX "post_reports_tenant_id_status_idx" ON "post_reports"("tenant_id", "status");

ALTER TABLE "posts" ADD CONSTRAINT "posts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_customer_id_fkey" FOREIGN KEY ("author_customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_author_customer_id_fkey" FOREIGN KEY ("author_customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_reports" ADD CONSTRAINT "post_reports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_reports" ADD CONSTRAINT "post_reports_reporter_customer_id_fkey" FOREIGN KEY ("reporter_customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- RLS por audiência (§2.2 · SEC-01). Comunidade fechada e por tenant: o cliente lê o
-- feed **publicado** do seu tenant e as curtidas/comentários; a equipe tem tudo do tenant
-- e modera. Denúncias (post_reports) são só da equipe — o cliente cria pelo servidor, não lê.
-- ============================================================================
ALTER TABLE "posts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "post_media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "post_likes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "post_comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "post_reports" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "posts"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');
CREATE POLICY customer_read ON "posts" FOR SELECT
  USING (app.current_role() = 'customer' AND "tenant_id" = app.current_tenant_id() AND "status" = 'published');

CREATE POLICY tenant_isolation ON "post_media"
  USING (EXISTS (SELECT 1 FROM posts p WHERE p.id = post_media.post_id AND p.tenant_id = app.current_tenant_id()) AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK (EXISTS (SELECT 1 FROM posts p WHERE p.id = post_media.post_id AND p.tenant_id = app.current_tenant_id()) AND app.current_role() IS DISTINCT FROM 'customer');
CREATE POLICY customer_read ON "post_media" FOR SELECT
  USING (app.current_role() = 'customer' AND EXISTS (SELECT 1 FROM posts p WHERE p.id = post_media.post_id AND p.tenant_id = app.current_tenant_id() AND p.status = 'published'));

CREATE POLICY tenant_isolation ON "post_likes"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');
CREATE POLICY customer_read ON "post_likes" FOR SELECT
  USING (app.current_role() = 'customer' AND "tenant_id" = app.current_tenant_id());

CREATE POLICY tenant_isolation ON "post_comments"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');
CREATE POLICY customer_read ON "post_comments" FOR SELECT
  USING (app.current_role() = 'customer' AND "tenant_id" = app.current_tenant_id() AND "status" = 'published');

CREATE POLICY tenant_isolation ON "post_reports"
  USING ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer')
  WITH CHECK ("tenant_id" = app.current_tenant_id() AND app.current_role() IS DISTINCT FROM 'customer');
