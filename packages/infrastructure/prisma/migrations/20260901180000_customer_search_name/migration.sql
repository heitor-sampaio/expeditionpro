-- CL-02 — busca de cliente sem acento.
--
-- `contains` com `mode: 'insensitive'` resolve caixa e não resolve acento: quem digita
-- "joao" no balcão não acha "João". A extensão `unaccent` do Postgres resolveria, mas
-- obrigaria a busca a virar SQL cru — e SQL cru sai de baixo da Prisma Client Extension,
-- que é quem injeta o `tenant_id`. Trocar isolamento de tenant por conveniência de busca é
-- um mau negócio.
--
-- Então a normalização é da aplicação (`searchKey`, no domínio) e mora nesta coluna. A
-- consulta continua pelo query builder, com o `tenant_id` injetado como em todo o resto.

ALTER TABLE "customers" ADD COLUMN "search_name" TEXT;

-- Backfill das linhas que já existem. O `translate` cobre o conjunto acentuado do
-- português e reproduz o que o `searchKey` faz em TypeScript; daqui para a frente é a
-- aplicação que escreve a coluna, e o teste de domínio é quem guarda a equivalência.
UPDATE "customers"
SET "search_name" = btrim(
  regexp_replace(
    translate(
      lower("full_name"),
      'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
      'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn'
    ),
    '\s+', ' ', 'g'
  )
);

ALTER TABLE "customers" ALTER COLUMN "search_name" SET NOT NULL;

-- Liderado por tenant_id, como todo índice de negócio aqui.
CREATE INDEX "customers_tenant_id_search_name_idx" ON "customers" ("tenant_id", "search_name");
