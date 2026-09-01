import type { Cpf } from '../identity/cpf.js';
import type { LocalDate } from '../date/localDate.js';

/**
 * Lista do seguro (GR-16) — o que vai na planilha da seguradora.
 *
 * A unidade aqui é a **pessoa**, não a família: seguro cobre indivíduos. É a diferença
 * para a roomlist (GR-15), onde cada registro é um quarto com o responsável à frente.
 */

export interface InsurancePerson {
  readonly fullName: string;
  readonly cpf: Cpf;
  readonly birthDate: LocalDate;
  readonly email: string | null;
  readonly phone: string | null;
}

/** Uma linha da planilha, com cada campo já no formato que a coluna espera. */
export interface InsuranceRow {
  /** Só dígitos: a coluna é numérica e tem o formato que pontua e repõe o zero à esquerda. */
  readonly cpf: string;
  readonly fullName: string;
  readonly birthDate: LocalDate;
  readonly email: string;
  readonly phone: string;
}

/**
 * GR-16 — monta as linhas na ordem recebida, **sem repetir pessoa**. Um acompanhante
 * pode estar em duas inscrições do mesmo grupo; a seguradora cobra por vida, e a mesma
 * vida duas vezes é erro caro de conferir depois.
 */
export function buildInsuranceList(people: readonly InsurancePerson[]): readonly InsuranceRow[] {
  const seen = new Set<string>();
  const rows: InsuranceRow[] = [];

  for (const person of people) {
    if (seen.has(person.cpf)) continue;
    seen.add(person.cpf);
    rows.push({
      cpf: person.cpf,
      fullName: person.fullName,
      birthDate: person.birthDate,
      email: person.email ?? '',
      phone: formatInsurancePhone(person.phone),
    });
  }

  return rows;
}

/**
 * Telefone no formato do cabeçalho da planilha: `(00)000000000`. Sem DDI e sem hífen —
 * o que o corretor importa é o que está no modelo, não o que é bonito de ler.
 */
export function formatInsurancePhone(phone: string | null): string {
  if (phone === null) return '';
  const digits = phone.replace(/\D/g, '');
  const national = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
  if (national.length !== 10 && national.length !== 11) return '';
  return `(${national.slice(0, 2)})${national.slice(2)}`;
}
