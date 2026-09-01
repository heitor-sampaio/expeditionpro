-- FO-07: chave PIX do fornecedor. Duas colunas, como `doc`/`doc_type`: o valor guardado
-- normalizado (dígitos no documento, E.164 no telefone, caixa baixa no resto) e o tipo
-- descoberto na borda pelo `parsePixKey`, para a leitura formatar sem readivinhar.
--
-- Nullable: fornecedor sem PIX é comum (recebe por boleto ou dinheiro), e exigir a chave
-- travaria o cadastro de quem não a tem.

ALTER TABLE "suppliers" ADD COLUMN "pix_key" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "pix_key_type" TEXT;
