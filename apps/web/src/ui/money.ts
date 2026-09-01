/**
 * Dinheiro para leitura na interface: centavos inteiros → `1.234.567,89`.
 *
 * Uma função só, e não uma por tela. Havia dez cópias disto no web, escritas à mão em
 * momentos diferentes — e duas tinham divergido: uma perdeu as contrabarras do regex de
 * agrupamento e nunca separava o milhar, outra usava `toFixed` e também não separava. O
 * resultado aparecia lado a lado na mesma tabela, `2392,47` embaixo de `3.580,00`.
 *
 * **Sem o "R$".** Onde este número aparece, ou a coluna já diz que é dinheiro, ou a frase
 * ao redor põe o símbolo — repetir em cada célula atrapalha o alinhamento da vírgula, que
 * é o que faz uma coluna de valores ser conferível de relance.
 *
 * O domínio tem o seu `formatBRL`, que trabalha com o tipo `Cents` (branded) e devolve com
 * símbolo. Aqui os valores chegam do DTO como `number` cru, e é da borda para dentro que a
 * marca existe — por isso a interface tem a sua.
 */
export function brl(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const reais = Math.floor(abs / 100);
  const centavos = String(abs % 100).padStart(2, '0');
  const grouped = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${grouped},${centavos}`;
}
