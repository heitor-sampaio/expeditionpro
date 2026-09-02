import { NotFoundError } from '../errors.js';
import { communityActorId } from './createPost.js';
import type { RequestContext } from '../context.js';
import type { CommunityRepository, PostRecord } from './communityRepository.js';

/**
 * CO-08 — o que se pode fazer com um post, dado o estado dele.
 *
 * A regra mora aqui e não copiada em cada caso de uso porque já apareceu três vezes: ler os
 * comentários, comentar e curtir. Nas três, o post entrava pelo id vindo da requisição e
 * ninguém conferia se ele existia, se era deste tenant ou se ainda estava no ar.
 *
 * `communityActorId` é quem recusa integração e sistema: comunidade é de cliente e equipe.
 */

/**
 * Para **ler**: a equipe alcança post moderado, porque decidir sobre uma denúncia exige ler
 * o que se tirou do ar. O cliente, não.
 */
export async function requireVisiblePost(
  community: CommunityRepository,
  ctx: RequestContext,
  postId: string,
): Promise<PostRecord> {
  const post = await community.getPost(ctx.tenantId, postId, communityActorId(ctx));
  // Removido e inexistente respondem igual: distinguir confirmaria que o post existiu.
  if (!post) throw new NotFoundError('post');
  if (ctx.actor.kind === 'customer' && post.status !== 'published') {
    throw new NotFoundError('post');
  }
  return post;
}

/**
 * Para **escrever**: post fora do ar não recebe mais nada, de ninguém.
 *
 * Sem isso a moderação vira teatro — a equipe tira do ar a discussão que virou briga e a
 * briga continua no post invisível, onde ninguém vê para intervir e os envolvidos veem
 * tudo. A única pista seria a contagem de comentários subindo num post que saiu do feed.
 */
export async function requireOpenPost(
  community: CommunityRepository,
  ctx: RequestContext,
  postId: string,
): Promise<PostRecord> {
  const post = await community.getPost(ctx.tenantId, postId, communityActorId(ctx));
  if (!post || post.status !== 'published') throw new NotFoundError('post');
  return post;
}
