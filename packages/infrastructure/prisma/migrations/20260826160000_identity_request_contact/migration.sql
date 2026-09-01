-- IN-04: divergência de dados na alocação (CPF conhecido chegando com telefone ou e-mail
-- diferente) entra na fila de revisão em vez de sobrescrever. A fila (identity_change_requests)
-- passa a carregar também o contato proposto, além da identidade (nome/CPF/nascimento).
-- Colunas nulas: NULL = campo não muda. Reversível (DROP COLUMN).
ALTER TABLE "identity_change_requests" ADD COLUMN "email" TEXT;
ALTER TABLE "identity_change_requests" ADD COLUMN "phone" TEXT;
