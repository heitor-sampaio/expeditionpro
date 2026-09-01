import { ApplicationError } from '../errors.js';

/**
 * CPF já cadastrado no tenant. Erro de negócio como tipo (§10.2) — a interface HTTP
 * mapeia para 409. A mensagem não carrega o CPF: dado pessoal não vai para log (SEC-05).
 */
export class DuplicateCpfError extends ApplicationError {
  readonly code = 'duplicate_cpf';
  constructor() {
    super('Já existe um cliente com este CPF neste tenant');
  }
}
