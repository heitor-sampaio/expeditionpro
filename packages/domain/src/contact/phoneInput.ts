/**
 * §3.2 — o telefone pontuado **enquanto se digita**, com o valor ainda incompleto.
 *
 * Diferente de `formatPhone`, que recebe um E.164 já normalizado e devolve `+55 (48)99999-8877`
 * para documento e ficha. Aqui a entrada é o que está no campo neste instante, quase sempre
 * pela metade, e a saída é o formato que se escreve no Brasil: `(48) 99999-8877`, sem DDI —
 * quem preenche não pensa em código de país, e o 55 é o servidor que põe, no `parsePhone`.
 *
 * **O separador só entra depois do dígito que o justifica**, senão apagar devolveria o
 * separador na hora e prenderia o cursor atrás dele.
 */
export function formatPhoneInput(raw: string): string {
  const digits = semDdi(raw.replace(/\D/g, ''));
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;

  const ddd = digits.slice(0, 2);
  const numero = digits.slice(2);
  if (numero.length === 0) return `(${ddd})`;

  /*
   * Celular tem nove dígitos e o hífen cai depois do quinto; fixo tem oito, e cai no quarto.
   * Quem decide é o **primeiro dígito**, não a quantidade: celular brasileiro começa com 9 e
   * fixo não. Decidir pela quantidade faria o hífen pular de lugar no meio da digitação — ele
   * apareceria no quarto dígito e andaria para o quinto quando o número crescesse.
   */
  const corte = numero.startsWith('9') ? 5 : 4;
  if (numero.length <= corte) return `(${ddd}) ${numero}`;
  return `(${ddd}) ${numero.slice(0, corte)}-${numero.slice(corte)}`;
}

/**
 * Quem copia do WhatsApp cola `+55 48 99999-8877`. Sem tirar o DDI, o 55 viraria o DDD e o
 * número inteiro andaria dois dígitos — errado de um jeito que a pessoa não percebe.
 *
 * O corte só vale **acima de onze dígitos**, que é o tamanho máximo de um número nacional:
 * `55999998877` é Santa Maria, não o Brasil, e sai inteiro.
 */
function semDdi(digits: string): string {
  const nacional = digits.length > 11 && digits.startsWith('55') ? digits.slice(2) : digits;
  return nacional.slice(0, 11);
}
