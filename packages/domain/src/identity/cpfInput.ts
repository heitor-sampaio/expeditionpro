/**
 * CL-01 — o CPF pontuado **enquanto se digita**, com o valor ainda incompleto.
 *
 * Diferente de `formatCpf`, que recebe um `Cpf` já validado e devolve a ficha pronta: aqui a
 * entrada é o que está no campo neste instante, que na maior parte do tempo não é um CPF.
 * Nada é validado — o campo pontua, e quem recusa é o servidor, no envio.
 *
 * **O separador só entra depois do dígito que o justifica.** `900` não vira `900.`, porque
 * apagar o `0` devolveria o ponto na hora e o cursor ficaria preso atrás dele — o defeito
 * clássico de campo com máscara, que faz a pessoa desistir de corrigir.
 */
export function formatCpfInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}
