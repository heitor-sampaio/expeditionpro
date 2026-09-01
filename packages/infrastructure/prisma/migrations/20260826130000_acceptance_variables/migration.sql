-- DOC-08: snapshot dos valores das variáveis no aceite. Reconstrói o contrato exato sob
-- demanda (texto congelado da versão + estes valores), sem PDF por cliente.
ALTER TABLE "document_acceptances" ADD COLUMN "variables" JSONB NOT NULL DEFAULT '{}';
