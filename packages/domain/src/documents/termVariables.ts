import { formatCpf, type Cpf } from '../identity/cpf.js';
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

export function resolveTermVariables(source: TermVariableSource): Record<string, string> {
  return {
    cliente_nome: source.customerName,
    cliente_cpf: formatCpf(source.customerCpf),
    roteiro: source.itineraryName ?? '',
    data_inicio: source.startDate ? formatBrDate(source.startDate) : '',
    data_fim: source.endDate ? formatBrDate(source.endDate) : '',
    participantes: source.participantNames.join(', '),
    valor_total: formatBRL(source.totalCents),
    empresa_nome: source.companyName ?? '',
    empresa_cnpj: source.companyCnpj ?? '',
  };
}

/** Data no formato de contrato: DD/MM/AAAA. */
function formatBrDate(date: LocalDate): string {
  const dd = String(date.day).padStart(2, '0');
  const mm = String(date.month).padStart(2, '0');
  return `${dd}/${mm}/${date.year}`;
}
