-- Post oficial da marca (CO-07): a equipe publica sem cliente autor.
-- author_customer_id passa a aceitar NULL (null = post oficial).
-- Reversível enquanto não houver posts oficiais: ALTER COLUMN ... SET NOT NULL.
ALTER TABLE "posts" ALTER COLUMN "author_customer_id" DROP NOT NULL;
