import { formatCpf, type Cpf } from '../identity/cpf.js';
import { escapeHtml } from './markdownTerm.js';
import { formatBRL, type Cents } from '../money/cents.js';
import type { LocalDate } from '../date/localDate.js';

/**
 * DOC-08 — resolve os valores das variáveis do Termo para o snapshot do aceite. Função
 * pura: dados da inscrição → mapa de strings já formatadas (CPF **cheio**, data BR, moeda).
 * Guardar esse mapa por aceite (jsonb pequeno) reconstrói o contrato exato sob demanda,
 * sem PDF por cliente. Campo ausente vira string vazia — contrato não tem "undefined".
 */

export interface TermVariableSource {
  readonly customerName: string;
  readonly customerCpf: Cpf;
  readonly itineraryName: string | null;
  readonly startDate: LocalDate | null;
  readonly endDate: LocalDate | null;
  readonly participantNames: readonly string[];
  readonly totalCents: Cents;
  readonly companyName: string | null;
  readonly companyCnpj: string | null;
}

/**
 * SEC-01 · DOC-09 — os valores saem daqui **escapados para HTML**.
 *
 * `renderTermTemplate` injeta estes valores no `contentHtml`, que já passou pelo
 * `renderMarkdownToSafeHtml` e vai direto para `dangerouslySetInnerHTML`. Ou seja: o que
 * sai daqui entra **depois** do escape, dentro de markup — e `cliente_nome`, `roteiro` e
 * `participantes` vêm do webhook público de inscrição, cuja validação é `String(raw).trim()`.
 *
 * Sem escapar, um nome com `<img onerror=...>` executava quando a equipe abria "ver termo
 * aceito" ou o cliente abria o contrato. O PRD (§1144) já dizia que "só o admin escreve"
 * não é defesa; a defesa tinha sido construída para o texto do admin e furada pelo dado do
 * cliente. É o mesmo escape que o e-mail já aplicava a estes campos.
 *
 * Os campos formatados por função (CPF, datas, moeda) não precisariam, mas passam pelo
 * mesmo caminho: uma regra sem exceção é mais fácil de manter certa que uma com.
 */
export function resolveTermVariables(source: TermVariableSource): Record<string, string> {
  return {
    cliente_nome: escapeHtml(source.customerName),
    cliente_cpf: escapeHtml(formatCpf(source.customerCpf)),
    roteiro: escapeHtml(source.itineraryName ?? ''),
    data_inicio: source.startDate ? formatBrDate(source.startDate) : '',
    data_fim: source.endDate ? formatBrDate(source.endDate) : '',
    participantes: escapeHtml(source.participantNames.join(', ')),
    valor_total: escapeHtml(formatBRL(source.totalCents)),
    empresa_nome: escapeHtml(source.companyName ?? ''),
    empresa_cnpj: escapeHtml(source.companyCnpj ?? ''),
  };
}

/** Data no formato de contrato: DD/MM/AAAA. */
function formatBrDate(date: LocalDate): string {
  const dd = String(date.day).padStart(2, '0');
  const mm = String(date.month).padStart(2, '0');
  return `${dd}/${mm}/${date.year}`;
}
