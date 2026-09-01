-- CL-02 — `search_name` passa a ser coluna **gerada**, não escrita pela aplicação.
--
-- A migration anterior criou a coluna e deixou a aplicação preenchê-la. Errado: dez seeds
-- de teste e dois arquivos que inserem cliente direto pelo Prisma quebraram, e todo seed
-- futuro pagaria o mesmo pedágio. Pior, o valor é **derivado** de `full_name` — dado
-- derivado escrito à mão em fixture é exatamente como fixture diverge da realidade.
--
-- `GENERATED ALWAYS ... STORED` fecha isso: nenhum caminho de escrita — repositório, seed,
-- SQL cru, script de importação futuro — consegue produzir linha inconsistente, e o
-- Postgres **recusa** quem tentar escrever a coluna. Falha alta, não silenciosa.
--
-- Todas as funções usadas são IMMUTABLE, que é o que a coluna gerada exige.
--
-- Resta uma junta: o termo digitado é normalizado em TypeScript (`searchKey`) e o valor
-- guardado, aqui em SQL. Se as duas divergirem, a busca erra em silêncio — por isso há um
-- teste de integração que roda as duas sobre o alfabeto português e compara.

DROP INDEX IF EXISTS "customers_tenant_id_search_name_idx";
ALTER TABLE "customers" DROP COLUMN "search_name";

ALTER TABLE "customers" ADD COLUMN "search_name" TEXT NOT NULL GENERATED ALWAYS AS (
  btrim(
    regexp_replace(
      translate(
        lower("full_name"),
        'áàâãäéèêëíìîïóòôõöúùûüçñ',
        'aaaaaeeeeiiiiooooouuuucn'
      ),
      '\s+', ' ', 'g'
    )
  )
) STORED;

CREATE INDEX "customers_tenant_id_search_name_idx" ON "customers" ("tenant_id", "search_name");
