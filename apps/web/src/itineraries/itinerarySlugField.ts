import { itinerarySlug } from '@expedition/domain';

/**
 * RO-02 — as duas decisões do campo de endereço do roteiro, fora do componente para caberem
 * no teste (a suíte roda em node, sem DOM).
 */

/**
 * A prévia do link público (IN-25) com o endereço que está sendo digitado — já normalizado,
 * porque é o que o servidor vai salvar. Sem ela, "endereço do link" é um campo que só quem
 * escreveu o código entende.
 *
 * Só o roteiro entra na prévia: o mês vem do botão do site, e inventar um aqui daria a
 * impressão de que a saída faz parte do endereço do roteiro.
 */
export function enderecoDoRoteiro(origin: string, digitado: string): string | null {
  const slug = itinerarySlug(digitado);
  return slug === null ? null : `${origin}/inscricao?roteiro=${slug}`;
}

/**
 * A mensagem de falha ao salvar um roteiro. O status sozinho não serve mais: `slug_taken` e
 * um campo torto qualquer chegam ambos como 400, e "confira os campos" não diz a quem está
 * editando que o endereço pertence a outro roteiro.
 */
export function mensagemDoErroDeRoteiro(status: number, code: string | undefined): string {
  if (code === 'slug_taken') return 'Esse endereço já é de outro roteiro. Escolha outro.';
  if (code === 'invalid_slug') return 'O endereço precisa ter ao menos uma letra ou número.';
  if (status === 400 || status === 422) return 'Confira os campos antes de salvar.';
  if (status === 409) return 'Já existe um roteiro com esse nome.';
  return 'Não foi possível salvar. Tente de novo.';
}
