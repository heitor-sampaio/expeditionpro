-- Curtir e comentar como a marca (CO-04): a equipe interage como a Drakkar.
-- Curtida: o "curtidor" passa a ser um id genérico (cliente OU usuário da equipe), sem FK.
ALTER TABLE "post_likes" DROP CONSTRAINT IF EXISTS "post_likes_customer_id_fkey";
ALTER TABLE "post_likes" RENAME COLUMN "customer_id" TO "liker_id";
-- Comentário: autor nulo = comentário oficial da marca.
ALTER TABLE "post_comments" ALTER COLUMN "author_customer_id" DROP NOT NULL;
