-- CreateTable
CREATE TABLE "itinerary_prices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "itinerary_id" UUID NOT NULL,
    "valid_from" DATE NOT NULL,
    "couple_cents" BIGINT NOT NULL,
    "solo_cents" BIGINT NOT NULL,
    "extra_adult_cents" BIGINT NOT NULL,
    "child_mid_cents" BIGINT NOT NULL,
    "child_young_cents" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "itinerary_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "itinerary_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "title" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "schedule_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "schedule_event_id" UUID,
    "itinerary_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "capacity_vehicles" INTEGER,
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "pricing_mode" TEXT NOT NULL DEFAULT 'itinerary',
    "cashback_override" JSONB,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "responsible_customer_id" UUID NOT NULL,
    "vehicle_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_note" TEXT,
    "rejected_reason" TEXT,
    "cancelled_by" UUID,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_reason" TEXT,
    "cashback_rule_snapshot" JSONB,
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "invoice_checked" BOOLEAN NOT NULL DEFAULT false,
    "invoice_checked_by" UUID,
    "invoice_checked_at" TIMESTAMP(3),
    "invoice_number" TEXT,
    "invoice_issued_at" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_participants" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "price_category" TEXT NOT NULL,
    "unit_price_cents" BIGINT NOT NULL,
    "price_source" TEXT NOT NULL DEFAULT 'auto',
    "price_note" TEXT,

    CONSTRAINT "booking_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "itinerary_prices_tenant_id_itinerary_id_idx" ON "itinerary_prices"("tenant_id", "itinerary_id");

-- CreateIndex
CREATE UNIQUE INDEX "itinerary_prices_tenant_id_itinerary_id_valid_from_key" ON "itinerary_prices"("tenant_id", "itinerary_id", "valid_from");

-- CreateIndex
CREATE INDEX "schedule_events_tenant_id_idx" ON "schedule_events"("tenant_id");

-- CreateIndex
CREATE INDEX "schedule_events_tenant_id_start_date_idx" ON "schedule_events"("tenant_id", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "groups_schedule_event_id_key" ON "groups"("schedule_event_id");

-- CreateIndex
CREATE INDEX "groups_tenant_id_idx" ON "groups"("tenant_id");

-- CreateIndex
CREATE INDEX "bookings_tenant_id_idx" ON "bookings"("tenant_id");

-- CreateIndex
CREATE INDEX "bookings_tenant_id_group_id_idx" ON "bookings"("tenant_id", "group_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_group_id_responsible_customer_id_key" ON "bookings"("group_id", "responsible_customer_id");

-- CreateIndex
CREATE INDEX "booking_participants_tenant_id_booking_id_idx" ON "booking_participants"("tenant_id", "booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_participants_booking_id_customer_id_key" ON "booking_participants"("booking_id", "customer_id");

-- AddForeignKey
ALTER TABLE "itinerary_prices" ADD CONSTRAINT "itinerary_prices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_prices" ADD CONSTRAINT "itinerary_prices_itinerary_id_fkey" FOREIGN KEY ("itinerary_id") REFERENCES "itineraries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_events" ADD CONSTRAINT "schedule_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_events" ADD CONSTRAINT "schedule_events_itinerary_id_fkey" FOREIGN KEY ("itinerary_id") REFERENCES "itineraries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_schedule_event_id_fkey" FOREIGN KEY ("schedule_event_id") REFERENCES "schedule_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_itinerary_id_fkey" FOREIGN KEY ("itinerary_id") REFERENCES "itineraries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_responsible_customer_id_fkey" FOREIGN KEY ("responsible_customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_participants" ADD CONSTRAINT "booking_participants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_participants" ADD CONSTRAINT "booking_participants_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_participants" ADD CONSTRAINT "booking_participants_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Isolamento multi-tenant por RLS (§2.2 · SEC-01)
-- ============================================================================
ALTER TABLE "itinerary_prices" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "itinerary_prices"
  USING ("tenant_id" = app.current_tenant_id()) WITH CHECK ("tenant_id" = app.current_tenant_id());

ALTER TABLE "schedule_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "schedule_events"
  USING ("tenant_id" = app.current_tenant_id()) WITH CHECK ("tenant_id" = app.current_tenant_id());

ALTER TABLE "groups" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "groups"
  USING ("tenant_id" = app.current_tenant_id()) WITH CHECK ("tenant_id" = app.current_tenant_id());

ALTER TABLE "bookings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "bookings"
  USING ("tenant_id" = app.current_tenant_id()) WITH CHECK ("tenant_id" = app.current_tenant_id());

ALTER TABLE "booking_participants" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "booking_participants"
  USING ("tenant_id" = app.current_tenant_id()) WITH CHECK ("tenant_id" = app.current_tenant_id());
