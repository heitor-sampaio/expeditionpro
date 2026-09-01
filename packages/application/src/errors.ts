/**
 * Erro de negócio é tipo, não string (§10.2). `catch` sem tratamento é proibido.
 *
 * Cada falha de caso de uso é uma classe com um `code` estável — a interface HTTP
 * mapeia `code` para status e mensagem de audiência, sem vazar estrutura interna
 * (§11.7). O `code` é o contrato; a mensagem é para humano.
 */

export abstract class ApplicationError extends Error {
  abstract readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Recurso não encontrado NO tenant. Responde 404 — e, onde confirmaria existência, 401 (§3.9). */
export class NotFoundError extends ApplicationError {
  readonly code = 'not_found';
  constructor(entity: string) {
    super(`${entity} não encontrado`);
  }
}

/** Ação vedada ao papel do ator (ex.: operator não confirma pagamento — IN-09). */
export class ForbiddenError extends ApplicationError {
  readonly code = 'forbidden';
}

/** Credencial de máquina ausente/inválida/revogada/expirada/sem escopo/de outro tenant (IN-22). Responde 401. */
export class UnauthorizedError extends ApplicationError {
  readonly code = 'unauthorized';
}

/** Violação de invariante de negócio (ex.: terceiro nível de família — CL-11). */
export class BusinessRuleError extends ApplicationError {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** Campo obrigatório ausente (ex.: e-mail/telefone do responsável — §3.2). Responde 422. */
export class RequiredFieldError extends ApplicationError {
  readonly code = 'required_field';
  readonly field: string;
  constructor(field: string) {
    super(`Campo obrigatório ausente: ${field}`);
    this.field = field;
  }
}
