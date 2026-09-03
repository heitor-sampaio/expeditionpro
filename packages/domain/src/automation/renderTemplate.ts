/**
 * AU-09 — as variáveis dentro do texto que vai para o cliente.
 *
 * A regra que decide tudo: **variável que não existe vira vazio, nunca o marcador cru**. Um
 * erro de quem escreveu a automação não pode virar "Bom dia, {{contato.nome}}" no WhatsApp de
 * um cliente — quem paga o vexame é a empresa, não quem digitou.
 *
 * Substituição em **uma passada só**, e por isso o valor de uma variável nunca é reinterpretado:
 * o que vem do contexto é dado de terceiro (nome de perfil do WhatsApp), e um contato chamado
 * `{{contato.telefone}}` não pode virar o telefone de ninguém.
 */

const MARCADOR = /\{\{\s*([\w.]+)\s*\}\}/g;

export function renderTemplate(texto: string, contexto: Record<string, unknown>): string {
  return texto.replace(MARCADOR, (_inteiro, caminho: string) => valorDe(contexto, caminho));
}

function valorDe(contexto: Record<string, unknown>, caminho: string): string {
  let atual: unknown = contexto;
  for (const parte of caminho.split('.')) {
    // Atravessar o que não é objeto devolve vazio: `contato.nome.sobrenome` não existe, e
    // inventar um valor ali seria pior que não dizer nada.
    if (atual === null || typeof atual !== 'object') return '';
    atual = (atual as Record<string, unknown>)[parte];
  }
  if (atual === null || atual === undefined) return '';
  return typeof atual === 'object' ? '' : String(atual);
}
