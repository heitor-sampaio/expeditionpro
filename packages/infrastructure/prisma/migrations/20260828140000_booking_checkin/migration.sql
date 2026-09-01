-- GR-14 · Check-in da inscrição: quem embarcou, e quando.
--
-- Duas colunas na própria inscrição em vez de tabela de eventos: check-in é um fato
-- único por inscrição, não um ledger — e desfazer é exceção da equipe, que já fica
-- registrada na trilha de auditoria (`booking.checkin` / `booking.checkin_undo`).
ALTER TABLE "bookings" ADD COLUMN "checked_in_at" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "checked_in_by" UUID;
