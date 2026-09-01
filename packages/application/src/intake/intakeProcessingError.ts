import { IntakeValidationError } from '@expedition/domain';

/**
 * IN-05 — resume a falha de processamento numa string curta gravada em `intake_events.error`
 * (visível na fila, sem dado pessoal). Erro de validação vira `campo: código`; qualquer
 * outra exceção vira uma marca genérica, sem vazar mensagem interna.
 */
export function describeProcessingError(error: unknown): string {
  if (error instanceof IntakeValidationError) {
    return `${error.field}: ${error.code}`;
  }
  return 'processing_error';
}
