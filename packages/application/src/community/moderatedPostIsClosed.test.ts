import { describe, expect, it } from 'vitest';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { fakeCommunityRepository } from './communityRepository.fake.js';
import { createPost } from './createPost.js';
import { commentOnPost } from './commentOnPost.js';
import { togglePostLike } from './togglePostLike.js';
import { moderatePost } from './moderatePost.js';
import { NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';

const cliente = (id: 'ana' | 'rui'): RequestContext => ({
  tenantId: 'tenant-a',
  actor: { kind: 'customer', userId: `u-${id}`, customerId: id },
});

const equipe: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u-chefe', role: 'owner' },
};

async function comPostRemovido() {
  const community = fakeCommunityRepository({ ana: 'Ana Prado', rui: 'Rui Alves' });
  const audit = fakeAuditLogRepository();
  const post = await createPost({ community }, cliente('ana'), {
    body: 'chegamos ao topo',
    itineraryId: null,
    groupId: null,
    layout: 'mosaic',
    media: [{ storagePath: 'p/1.webp', alt: null }],
  });
  await moderatePost({ community, audit }, equipe, {
    postId: post.id,
    action: 'remove',
    reason: 'fora das regras',
  });
  return { community, post };
}

/**
 * CO-08 — post tirado do ar fica fechado para interação.
 *
 * A leitura dos comentários já foi fechada. Ficaram as **escritas**: comentar e curtir não
 * olhavam o post — nem o status, nem se ele existe, nem se é deste tenant. `addComment`
 * recebia um `postId` e gravava.
 *
 * O efeito prático é o pior tipo de moderação: a equipe tira do ar a discussão que virou
 * briga, e a briga continua acontecendo no post invisível. Ninguém vê para intervir, os
 * envolvidos veem tudo, e a única pista é a contagem de comentários crescendo num post que
 * saiu do feed.
 *
 * O post inexistente responde igual ao removido, pelo mesmo motivo da leitura: distinguir
 * confirmaria que existiu.
 */
describe('CO-08: post moderado não aceita mais interação', () => {
  it('cliente não comenta em post removido', async () => {
    const { community, post } = await comPostRemovido();

    await expect(
      commentOnPost({ community }, cliente('rui'), { postId: post.id, body: 'e aí' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('cliente não curte post removido', async () => {
    const { community, post } = await comPostRemovido();

    await expect(
      togglePostLike({ community }, cliente('rui'), { postId: post.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('post que não existe responde igual — não conta o que não existiu', async () => {
    const { community } = await comPostRemovido();

    await expect(
      commentOnPost({ community }, cliente('rui'), { postId: 'fantasma', body: 'e aí' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('post publicado segue aceitando comentário e curtida', async () => {
    const community = fakeCommunityRepository({ ana: 'Ana Prado', rui: 'Rui Alves' });
    const post = await createPost({ community }, cliente('ana'), {
      body: 'no acampamento',
      itineraryId: null,
      groupId: null,
      layout: 'mosaic',
      media: [{ storagePath: 'p/2.webp', alt: null }],
    });

    const comentario = await commentOnPost({ community }, cliente('rui'), {
      postId: post.id,
      body: 'boa!',
    });
    const curtida = await togglePostLike({ community }, cliente('rui'), { postId: post.id });

    expect(comentario.body).toBe('boa!');
    expect(curtida.liked).toBe(true);
  });
});
