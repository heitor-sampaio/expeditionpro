import { describe, expect, it } from 'vitest';
import { fakeCommunityRepository } from './communityRepository.fake.js';
import { createPost } from './createPost.js';
import { commentOnPost } from './commentOnPost.js';
import { moderatePost } from './moderatePost.js';
import { listPostComments } from './listPostComments.js';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';

const cliente = (id: 'ana' | 'rui'): RequestContext => ({
  tenantId: 'tenant-a',
  actor: { kind: 'customer', userId: `u-${id}`, customerId: id },
});

const equipe: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u-chefe', role: 'owner' },
};

const integracao: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'integration', apiKeyId: 'k1', scopes: ['intake:write'] },
};

async function comPostEComentario() {
  const community = fakeCommunityRepository({ ana: 'Ana Prado', rui: 'Rui Alves' });
  const audit = fakeAuditLogRepository();
  const post = await createPost({ community }, cliente('ana'), {
    body: 'chegamos ao topo',
    itineraryId: null,
    groupId: null,
    layout: 'mosaic',
    media: [{ storagePath: 'p/1.webp', alt: null }],
  });
  await commentOnPost({ community }, cliente('rui'), { postId: post.id, body: 'que vista' });
  return { community, audit, post };
}

/**
 * CO-08 — os comentários passam pelo caso de uso, não pelo repositório.
 *
 * A rota lia `community.listComments` **direto**, sem guarda nenhuma. Era a mesma forma dos
 * furos fechados em fornecedores e recebimentos: rota que atalha o caso de uso herda zero
 * regra de audiência.
 *
 * O que isso deixava passar não era o comentário em si — a comunidade é do tenant e todo
 * mundo lê o feed. Era o post **tirado do ar**: a moderação removia o post e a conversa
 * dele continuava legível por quem soubesse o id, inclusive a denúncia que motivou a
 * remoção. Tirar do ar tem que tirar do ar.
 */
describe('CO-08: comentários de um post', () => {
  it('o cliente lê os comentários de um post publicado', async () => {
    const { community, post } = await comPostEComentario();

    const comentarios = await listPostComments({ community }, cliente('ana'), { postId: post.id });

    expect(comentarios.map((c) => c.body)).toEqual(['que vista']);
  });

  it('post removido pela moderação não mostra mais a conversa ao cliente', async () => {
    const { community, audit, post } = await comPostEComentario();
    await moderatePost({ community, audit }, equipe, {
      postId: post.id,
      action: 'remove',
      reason: 'fora das regras',
    });

    await expect(
      listPostComments({ community }, cliente('ana'), { postId: post.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('a equipe continua vendo — moderar exige ler o que foi tirado do ar', async () => {
    const { community, audit, post } = await comPostEComentario();
    await moderatePost({ community, audit }, equipe, {
      postId: post.id,
      action: 'remove',
      reason: 'fora das regras',
    });

    const comentarios = await listPostComments({ community }, equipe, { postId: post.id });

    expect(comentarios.map((c) => c.body)).toEqual(['que vista']);
  });

  it('post inexistente responde 404, não lista vazia', async () => {
    const { community } = await comPostEComentario();

    await expect(
      listPostComments({ community }, cliente('ana'), { postId: 'fantasma' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('integração não lê a comunidade — a chave de API é para intake, não para conversa', async () => {
    const { community, post } = await comPostEComentario();

    await expect(
      listPostComments({ community }, integracao, { postId: post.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
