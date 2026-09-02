import { requireVisiblePost } from './postAccess.js';
import type { RequestContext } from '../context.js';
import type { CommentRecord, CommunityRepository } from './communityRepository.js';

export interface ListPostCommentsDeps {
  readonly community: CommunityRepository;
}

export interface ListPostCommentsCommand {
  readonly postId: string;
}

/**
 * CO-08 — os comentários de um post.
 *
 * A rota lia `community.listComments` **direto**, sem guarda nenhuma. Era a mesma forma dos
 * furos fechados em fornecedores e recebimentos: rota que atalha o caso de uso herda zero
 * regra de audiência.
 *
 * O que passava não era o comentário em si — a comunidade é do tenant e todo mundo lê o
 * feed. Era o post **tirado do ar**: a moderação removia o post e a conversa dele continuava
 * legível por quem soubesse o id, inclusive a discussão que motivou a remoção. Tirar do ar
 * tem que tirar do ar.
 *
 * A equipe continua enxergando o que foi moderado, porque decidir sobre uma denúncia exige
 * ler o que se tirou. Post inexistente e post fora do ar respondem igual para o cliente:
 * distinguir os dois confirmaria que o post existiu.
 */
export async function listPostComments(
  deps: ListPostCommentsDeps,
  ctx: RequestContext,
  command: ListPostCommentsCommand,
): Promise<CommentRecord[]> {
  await requireVisiblePost(deps.community, ctx, command.postId);

  return deps.community.listComments(ctx.tenantId, command.postId);
}
