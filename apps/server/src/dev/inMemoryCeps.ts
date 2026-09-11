import type { CepAddress, CepDirectory } from '@expedition/application';

/**
 * CL-02 — diretório de CEP de memória, para dev e teste.
 *
 * Existe para o `inMemoryServerDeps` não carregar uma dependência de rede: um teste de rota
 * que toca o ViaCEP de verdade falha quando a internet oscila e passa a medir o serviço dos
 * outros. O dev server de verdade (`main.ts`) usa o ViaCEP, porque lá o formato do outro lado
 * é justamente o que se quer ver.
 *
 * Semeia um CEP só, o suficiente para exercitar o caminho feliz; qualquer outro é "não achei",
 * que é o caminho que a tela precisa saber atravessar.
 */

const SEMEADOS: Record<string, CepAddress> = {
  '88010000': {
    street: 'Rua Felipe Schmidt',
    district: 'Centro',
    city: 'Florianópolis',
    state: 'SC',
  },
};

export function inMemoryCeps(semeados: Record<string, CepAddress> = SEMEADOS): CepDirectory {
  return {
    lookup: (cep: string) => Promise.resolve(semeados[cep] ?? null),
  };
}
