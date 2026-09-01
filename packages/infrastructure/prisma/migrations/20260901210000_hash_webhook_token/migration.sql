-- PG-01 · SEC-01 — o segredo de webhook deixa de ser guardado em claro.
--
-- Era o **único segredo do sistema** em texto claro: a API key de intake é `sha256`, o
-- access token do gateway é AES-256-GCM, e este ficou cru — enquanto é justamente o que
-- separa a internet de "marcar inscrição como paga". Qualquer leitura do banco (backup,
-- dump, credencial de leitura vazada) entregava esse poder.
--
-- **Hash e não cifra**, e é aqui que a escolha se decide: o hash migra sem chave nenhuma.
-- Cifrar exigiria a `PAYMENT_TOKEN_KEY`, que vive no ambiente da aplicação e não no
-- Postgres — a linha que já existe ficaria em claro até alguém reconectar o gateway.
--
-- O segredo em si **não muda**: o webhook já configurado no ASAAS continua valendo. O que
-- muda é que ele deixa de ser legível a partir do banco. Reconectar mantém a linha, então
-- também não força reconfiguração.

ALTER TABLE "payment_integrations" ADD COLUMN "webhook_token_hash" TEXT;

-- `sha256` nativo do Postgres, sem extensão. Mesmo algoritmo que a aplicação usa para a
-- API key de intake, para não haver duas definições do mesmo hash no projeto.
UPDATE "payment_integrations"
SET "webhook_token_hash" = encode(sha256("webhook_token"::bytea), 'hex');

ALTER TABLE "payment_integrations" ALTER COLUMN "webhook_token_hash" SET NOT NULL;
ALTER TABLE "payment_integrations" DROP COLUMN "webhook_token";

-- Busca do webhook é por hash, escopada ao tenant da URL.
CREATE INDEX "payment_integrations_tenant_id_webhook_token_hash_idx"
  ON "payment_integrations" ("tenant_id", "webhook_token_hash");
