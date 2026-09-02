-- AT-13 — a mídia que o lead manda.
--
-- O arquivo vive no bucket privado `conversations`; aqui fica só o ponteiro e o que a tela
-- precisa para decidir como mostrar. `media_path` nunca é URL: URL de mídia é assinada na
-- hora de abrir o fio e vale minutos.

ALTER TABLE "messages"
  ADD COLUMN "media_kind"      TEXT,
  ADD COLUMN "media_mime_type" TEXT,
  ADD COLUMN "media_file_name" TEXT,
  ADD COLUMN "media_path"      TEXT,
  ADD COLUMN "media_size"      BIGINT;

-- Ou a mensagem tem anexo por inteiro, ou não tem nenhum. Meia linha preenchida seria um
-- anexo que a tela promete e não consegue mostrar.
ALTER TABLE "messages" ADD CONSTRAINT "messages_media_check" CHECK (
  ("media_path" IS NULL AND "media_kind" IS NULL AND "media_mime_type" IS NULL)
  OR ("media_path" IS NOT NULL AND "media_kind" IS NOT NULL AND "media_mime_type" IS NOT NULL)
);

ALTER TABLE "messages" ADD CONSTRAINT "messages_media_kind_check" CHECK (
  "media_kind" IS NULL OR "media_kind" IN ('image', 'video', 'audio', 'document', 'sticker')
);

-- O bucket vive no Supabase, que não existe no Postgres do CI — daí o bloco guardado, o
-- mesmo padrão das policies de Storage já versionadas.
--
-- **Sem policy de leitura, de propósito.** Todo acesso passa pelo servidor, que assina uma
-- URL curta com a chave de serviço depois de conferir a audiência (AT-11: atendimento é só da
-- equipe). Uma policy para `authenticated` abriria um segundo caminho — a API de Storage
-- direto, sem passar por nós — e cliente também é `authenticated`.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('conversations', 'conversations', false)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
