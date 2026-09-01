/**
 * Ações de vínculo da ficha (CL-10) e o merge de duplicados (CL-07).
 *
 * As guardas de verdade estão no servidor; aqui só decidimos o que a ficha oferece.
 * Ação indisponível continua visível e desabilitada, com o motivo à vista — esconder
 * a ação esconde o sistema (design system §7).
 */

export type FamilyActionId = 'move' | 'promote' | 'merge';

export interface FamilyAction {
  readonly id: FamilyActionId;
  readonly label: string;
  readonly enabled: boolean;
  readonly reason: string | null;
}

export interface FamilyActionsInput {
  readonly role: 'responsible' | 'companion';
  readonly companionCount: number;
}

const HAS_DEPENDENTS = 'Realoque ou promova os acompanhantes antes de vincular.';

export function resolveFamilyActions(input: FamilyActionsInput): readonly FamilyAction[] {
  // Um responsável com acompanhantes não pode virar acompanhante: viraria terceiro
  // nível de família (CL-11), e o servidor recusa com has_dependents.
  const blocksMove = input.role === 'responsible' && input.companionCount > 0;
  const alreadyHead = input.role === 'responsible';

  return [
    {
      id: 'move',
      label: 'Vincular a outra família',
      enabled: !blocksMove,
      reason: blocksMove ? HAS_DEPENDENTS : null,
    },
    {
      id: 'promote',
      label: 'Tornar responsável',
      enabled: !alreadyHead,
      reason: alreadyHead ? 'Já é responsável da própria família.' : null,
    },
    { id: 'merge', label: 'Mesclar cadastro duplicado', enabled: true, reason: null },
  ];
}

export function familyErrorFor(code: string): string {
  switch (code) {
    case 'self_link':
      return 'Um cliente não pode ser vinculado a si mesmo.';
    case 'not_a_responsible':
      return 'O destino precisa ser um responsável de família.';
    case 'has_dependents':
      return HAS_DEPENDENTS;
    case 'not_same_family':
      return 'Só dá para levar acompanhantes da família de origem.';
    case 'merge_self':
      return 'Escolha outro cadastro: não dá para mesclar um cliente com ele mesmo.';
    case 'survivor_not_responsible':
      return 'Para herdar os acompanhantes, o cadastro mantido precisa ser responsável.';
    case 'not_found':
      return 'Cadastro não encontrado — atualize a busca e tente de novo.';
    case 'network':
      return 'Sem conexão com o servidor. Tente de novo.';
    default:
      return 'Não foi possível concluir. Tente de novo.';
  }
}
