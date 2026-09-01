-- Layout de exibição das fotos de um post (CO-01): 'carousel' ou 'mosaic'.
-- Default 'mosaic' preserva os posts existentes. Reversível: DROP COLUMN "layout".
ALTER TABLE "posts" ADD COLUMN "layout" TEXT NOT NULL DEFAULT 'mosaic';
