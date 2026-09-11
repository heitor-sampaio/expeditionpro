import { isValidCep, normalizeCep } from '@expedition/domain';
import { BusinessRuleError } from '../errors.js';
import type { CepAddress, CepDirectory } from './cepDirectory.js';

/**
 * CL-02 — o endereço de um CEP.
 *
 * **Sem guarda de audiência, de propósito**: um CEP não é dado de ninguém, e a página pública
 * de inscrição (IN-25) precisa dele sem ter sessão. É a mesma natureza do
 * `resolvePublicEnrollmentLink` — leitura que responde a um estranho —, só que aqui não há nem
 * tenant envolvido: o CEP é o mesmo para todo mundo.
 *
 * A recusa de formato vem antes da rede. Oito dígitos é tudo o que se sabe sobre um CEP sem
 * perguntar, e perguntar por "abc" gastaria uma chamada externa para ouvir não — de graça, num
 * endereço que qualquer um alcança.
 *
 * Não encontrado é `null`, não erro: CEP que não existe é resposta, e a tela segue com o
 * preenchimento à mão.
 */

export interface LookupCepDeps {
  readonly ceps: CepDirectory;
}

export interface LookupCepCommand {
  readonly cep: string;
}

export async function lookupCep(
  deps: LookupCepDeps,
  command: LookupCepCommand,
): Promise<CepAddress | null> {
  if (!isValidCep(command.cep)) {
    throw new BusinessRuleError('invalid_cep', 'O CEP precisa ter oito dígitos');
  }
  return deps.ceps.lookup(normalizeCep(command.cep));
}
