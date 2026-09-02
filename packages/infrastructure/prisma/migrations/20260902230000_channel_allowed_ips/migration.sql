-- AT-02 — de onde o provedor pode chamar o webhook.
--
-- Nem toda instalação da Evolution deixa configurar cabeçalho ou corpo na chamada. Quando não
-- deixa, o único jeito de saber quem está do outro lado é o endereço da conexão: a equipe
-- declara o servidor da instância e só ele entra.
--
-- Vazio é **cerca desligada**, e cerca desligada não libera ninguém: o canal segue exigindo o
-- segredo. O padrão de quem esquece de preencher tem que ser o fechado.

ALTER TABLE "channel_integrations"
  ADD COLUMN "allowed_ips" TEXT[] NOT NULL DEFAULT '{}';
