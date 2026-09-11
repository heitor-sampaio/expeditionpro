/**
 * CL-02 — port do diretório de CEP: o que um CEP responde, sem dizer quem responde.
 *
 * O que existe hoje do outro lado é o ViaCEP, e ele **não** é chamado pelo navegador. Duas
 * razões, e a segunda é a que decidiu: a CSP do front não o lista em `connect-src` (a consulta
 * vinha sendo bloqueada em silêncio, com a tela dizendo "CEP não encontrado"), e a página de
 * inscrição é pública — chamá-lo do navegador daria a um terceiro o IP de todo interessado,
 * que é a mesma objeção que manteve o captcha fora do escopo (SEC-20).
 */

export interface CepAddress {
  readonly street: string;
  readonly district: string;
  readonly city: string;
  /** UF em duas letras. */
  readonly state: string;
}

export interface CepDirectory {
  /** Recebe **oito dígitos**; quem normaliza e recusa formato é o caso de uso. */
  lookup(cep: string): Promise<CepAddress | null>;
}
