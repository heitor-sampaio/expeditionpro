-- PG-06 · Cobranças ao vivo.
--
-- A cobrança muda de estado sem ninguém clicar aqui: quem muda é o webhook do provedor
-- quando o cliente paga. Sem realtime, a inscrição e o financeiro mostrariam "aguardando"
-- até alguém recarregar a página.
ALTER TABLE "payment_charges" REPLICA IDENTITY FULL;

-- A publicação é do Supabase e não existe no Postgres dos testes: adiciona só onde há.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'payment_charges'
     )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_charges;
  END IF;
END $$;
