-- Remove `year` e `color` de vehicles: campos nunca solicitados no cadastro (PC-06).
-- Reversível: para reverter, recrie as colunas opcionais —
--   ALTER TABLE "vehicles" ADD COLUMN "year" INTEGER;
--   ALTER TABLE "vehicles" ADD COLUMN "color" TEXT;
ALTER TABLE "vehicles" DROP COLUMN "year";
ALTER TABLE "vehicles" DROP COLUMN "color";
