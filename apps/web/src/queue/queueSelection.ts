import type { GroupOption } from './useQueue.js';

/**
 * §5.8 — qual saída já vem selecionada ao abrir um item da fila. É a que o cliente
 * escolheu no app, **desde que ainda esteja na agenda**: saída excluída depois do pedido
 * deixaria a tela oferecendo alocar num grupo que não existe mais.
 */
export function initialGroupId(
  chosenGroupId: string | null,
  groups: readonly GroupOption[],
): string {
  if (!chosenGroupId) return '';
  return groups.some((group) => group.id === chosenGroupId) ? chosenGroupId : '';
}
