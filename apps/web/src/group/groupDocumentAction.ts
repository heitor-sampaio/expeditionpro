/**
 * GR-15/GR-16 — a régua dos documentos da saída (roomlist e lista do seguro).
 *
 * Pura, como `scheduleActions.ts`: a tela só renderiza o que esta função decide. O
 * servidor continua sendo quem manda — aqui é para não deixar clicar no que já se sabe
 * que vai falhar, e para dizer o motivo em vez de esconder a ação.
 */

export interface GroupDocumentInput {
  readonly confirmedCount: number;
  readonly role: string | null;
}

export interface GroupDocumentAction {
  readonly enabled: boolean;
  readonly reason: string | null;
}

const NEEDS_ROLE = 'Gerar documentos da saída exige owner ou admin.';
const NO_CONFIRMED = 'Nenhuma inscrição confirmada nesta saída.';

export function resolveGroupDocumentAction(input: GroupDocumentInput): GroupDocumentAction {
  // Permissão primeiro: quem não pode gerar não resolve o resto esperando alguém pagar.
  if (input.role !== 'owner' && input.role !== 'admin') {
    return { enabled: false, reason: NEEDS_ROLE };
  }
  if (input.confirmedCount === 0) {
    return { enabled: false, reason: NO_CONFIRMED };
  }
  return { enabled: true, reason: null };
}

export function documentErrorFor(code: string): string {
  switch (code) {
    case 'forbidden':
      return NEEDS_ROLE;
    case 'not_found':
      return 'Esta saída não existe mais.';
    default:
      return 'Não foi possível gerar o documento. Tente de novo.';
  }
}

/** O nome do arquivo é do servidor; a tela só o repassa ao download. */
export function fileNameFromDisposition(header: string | null, fallback: string): string {
  const match = header?.match(/filename="([^"]+)"/);
  return match?.[1] ?? fallback;
}
