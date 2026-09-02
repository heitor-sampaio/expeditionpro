/**
 * SEC — prazo das chamadas de saída (ASAAS, Supabase Admin, Resend).
 *
 * `fetch` sem sinal não tem prazo nenhum em Node: um serviço que aceita a conexão e nunca
 * responde prende a requisição do nosso lado para sempre. É o modo de falha mais comum de
 * API sob carga e o mais difícil de perceber — nenhum erro aparece, as conexões só somem
 * uma a uma até o servidor parar de aceitar gente nova.
 *
 * 15 segundos é generoso para as três: o ASAAS responde em menos de um, e o que passa disso
 * já não é lentidão, é serviço fora do ar. Esperar mais não melhora nada e só transfere a
 * indisponibilidade deles para cá.
 */
export const OUTBOUND_TIMEOUT_MS = 15_000;
