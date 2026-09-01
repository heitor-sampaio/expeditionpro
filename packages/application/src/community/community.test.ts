import { describe, expect, it } from 'vitest';
import { PostValidationError } from '@expedition/domain';
import { fakeCommunityRepository } from './communityRepository.fake.js';
import { createPost } from './createPost.js';
import { getCommunityFeed } from './getCommunityFeed.js';
import { togglePostLike } from './togglePostLike.js';
import { commentOnPost } from './commentOnPost.js';
import { reportContent } from './reportContent.js';
import { moderatePost } from './moderatePost.js';
import { getModerationQueue } from './getModerationQueue.js';
import { resolveReport } from './resolveReport.js';
import { setPostHighlight } from './setPostHighlight.js';
import { deleteOwnPost } from './deleteOwnPost.js';
import { deleteOwnComment } from './deleteOwnComment.js';
import { ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';

const team: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};
const customer = (id: string): RequestContext => ({
  tenantId: 'tenant-a',
  actor: { kind: 'customer', userId: `auth-${id}`, customerId: id },
});

function deps() {
  return { community: fakeCommunityRepository({ ana: 'Ana Prado', rui: 'Rui Alves' }) };
}

const media = [{ storagePath: 'p/1.webp', alt: null }];

describe('CO-01/CO-07: criar post (foto com legenda, publica direto)', () => {
  it('o cliente publica um post e ele entra no feed', async () => {
    const d = deps();
    const post = await createPost(d, customer('ana'), {
      body: 'Que dia!',
      itineraryId: null,
      groupId: null,
      layout: 'mosaic',
      media,
    });
    expect(post.status).toBe('published');
    expect(post.authorName).toBe('Ana Prado');

    const feed = await getCommunityFeed(d, customer('rui'), { limit: 20 });
    expect(feed).toHaveLength(1);
    expect(feed[0]!.id).toBe(post.id);
  });

  it('CO-09: o autor apaga a própria publicação e ela sai do feed', async () => {
    const d = deps();
    const post = await createPost(d, customer('ana'), {
      body: 'apagar depois',
      itineraryId: null,
      groupId: null,
      layout: 'mosaic',
      media,
    });
    await deleteOwnPost(d, customer('ana'), post.id);
    const feed = await getCommunityFeed(d, customer('ana'), { limit: 20 });
    expect(feed).toHaveLength(0);
  });

  it('CO-09: só o autor apaga — outro cliente recebe ForbiddenError', async () => {
    const d = deps();
    const post = await createPost(d, customer('ana'), {
      body: 'da ana',
      itineraryId: null,
      groupId: null,
      layout: 'mosaic',
      media,
    });
    await expect(deleteOwnPost(d, customer('rui'), post.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('post sem foto é recusado (CO-01)', async () => {
    const d = deps();
    await expect(
      createPost(d, customer('ana'), {
        body: 'x',
        itineraryId: null,
        groupId: null,
        layout: 'mosaic',
        media: [],
      }),
    ).rejects.toBeInstanceOf(PostValidationError);
  });

  it('CO-07: a equipe publica como a marca (post oficial, sem cliente autor)', async () => {
    const d = deps();
    const post = await createPost(d, team, {
      body: 'aviso oficial',
      itineraryId: null,
      groupId: null,
      layout: 'mosaic',
      media,
    });
    expect(post.official).toBe(true);
    expect(post.authorCustomerId).toBeNull();
    expect(post.authorName).toBe('Drakkar');
  });
});

describe('CO-03: feed cronológico e filtro por roteiro', () => {
  it('mais recentes primeiro e filtra por roteiro', async () => {
    const d = deps();
    await createPost(d, customer('ana'), {
      body: 'a',
      itineraryId: 'itin-1',
      groupId: null,
      layout: 'mosaic',
      media,
    });
    await createPost(d, customer('rui'), {
      body: 'b',
      itineraryId: 'itin-2',
      groupId: null,
      layout: 'mosaic',
      media,
    });
    await createPost(d, customer('ana'), {
      body: 'c',
      itineraryId: 'itin-1',
      groupId: null,
      layout: 'mosaic',
      media,
    });

    const feed = await getCommunityFeed(d, customer('ana'), { limit: 20 });
    expect(feed.map((p) => p.body)).toEqual(['c', 'b', 'a']); // cronológico desc

    const filtered = await getCommunityFeed(d, customer('ana'), {
      limit: 20,
      itineraryId: 'itin-1',
    });
    expect(filtered.map((p) => p.body)).toEqual(['c', 'a']);
  });
});

describe('CO-04: curtidas e comentários', () => {
  it('curtir alterna e conta; likedByViewer reflete o leitor', async () => {
    const d = deps();
    const post = await createPost(d, customer('ana'), {
      body: 'x',
      itineraryId: null,
      groupId: null,
      layout: 'mosaic',
      media,
    });
    const on = await togglePostLike(d, customer('rui'), { postId: post.id });
    expect(on).toEqual({ liked: true, likeCount: 1 });

    const feedRui = await getCommunityFeed(d, customer('rui'), { limit: 20 });
    expect(feedRui[0]!.likedByViewer).toBe(true);
    const feedAna = await getCommunityFeed(d, customer('ana'), { limit: 20 });
    expect(feedAna[0]!.likedByViewer).toBe(false);

    const off = await togglePostLike(d, customer('rui'), { postId: post.id });
    expect(off).toEqual({ liked: false, likeCount: 0 });
  });

  it('comentar valida o tamanho (≤1000) e aparece na lista', async () => {
    const d = deps();
    const post = await createPost(d, customer('ana'), {
      body: 'x',
      itineraryId: null,
      groupId: null,
      layout: 'mosaic',
      media,
    });
    await commentOnPost(d, customer('rui'), { postId: post.id, body: 'top!' });
    const comments = await d.community.listComments('tenant-a', post.id);
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({ authorName: 'Rui Alves', body: 'top!' });

    await expect(
      commentOnPost(d, customer('rui'), { postId: post.id, body: 'x'.repeat(1001) }),
    ).rejects.toBeInstanceOf(PostValidationError);
  });

  it('CO-04: a equipe comenta como a marca (autor oficial nulo → nome da marca)', async () => {
    const d = deps();
    const post = await createPost(d, customer('ana'), {
      body: 'x',
      itineraryId: null,
      groupId: null,
      layout: 'mosaic',
      media,
    });
    await commentOnPost(d, team, { postId: post.id, body: 'obrigado pela foto!' });
    const comments = await d.community.listComments('tenant-a', post.id);
    expect(comments[0]).toMatchObject({ authorCustomerId: null, authorName: 'Drakkar' });
  });

  it('CO-04: a equipe curte (curtida da marca, contabilizada)', async () => {
    const d = deps();
    const post = await createPost(d, customer('ana'), {
      body: 'x',
      itineraryId: null,
      groupId: null,
      layout: 'mosaic',
      media,
    });
    const r = await togglePostLike(d, team, { postId: post.id });
    expect(r).toEqual({ liked: true, likeCount: 1 });
  });
});

describe('CO-08: denúncia e moderação', () => {
  it('cliente denuncia; a equipe oculta e o post sai do feed', async () => {
    const d = deps();
    const post = await createPost(d, customer('ana'), {
      body: 'ruim',
      itineraryId: null,
      groupId: null,
      layout: 'mosaic',
      media,
    });
    await reportContent(d, customer('rui'), { postId: post.id, reason: 'ofensivo' });
    expect(d.community.reports).toHaveLength(1);

    await moderatePost(d, team, { postId: post.id, action: 'remove', reason: 'quebra as regras' });

    const feed = await getCommunityFeed(d, customer('rui'), { limit: 20 });
    expect(feed).toHaveLength(0); // removido não aparece
  });

  it('cliente não modera (403)', async () => {
    const d = deps();
    const post = await createPost(d, customer('ana'), {
      body: 'x',
      itineraryId: null,
      groupId: null,
      layout: 'mosaic',
      media,
    });
    await expect(
      moderatePost(d, customer('rui'), { postId: post.id, action: 'remove', reason: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('CO-08: fila de denúncias', () => {
  it('a equipe vê as denúncias abertas enriquecidas e as resolve', async () => {
    const d = deps();
    const post = await createPost(d, customer('ana'), {
      body: 'conteúdo ruim',
      itineraryId: null,
      groupId: null,
      layout: 'mosaic',
      media,
    });
    await reportContent(d, customer('rui'), { postId: post.id, reason: 'ofensivo' });

    const queue = await getModerationQueue(d, team);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      reason: 'ofensivo',
      reporterName: 'Rui Alves',
      postAuthorName: 'Ana Prado',
      postBody: 'conteúdo ruim',
    });

    await resolveReport(d, team, { reportId: queue[0]!.id, decision: 'dismissed' });
    const after = await getModerationQueue(d, team);
    expect(after).toHaveLength(0); // saiu da fila
  });

  it('cliente não vê a fila nem resolve (403)', async () => {
    const d = deps();
    await expect(getModerationQueue(d, customer('rui'))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      resolveReport(d, customer('rui'), { reportId: 'x', decision: 'resolved' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('CO-11: curadoria/destaque', () => {
  it('a equipe destaca um post e o filtro de destaques o traz; cliente não destaca (403)', async () => {
    const d = deps();
    const a = await createPost(d, customer('ana'), {
      body: 'a',
      itineraryId: null,
      groupId: null,
      layout: 'mosaic',
      media,
    });
    await createPost(d, customer('rui'), {
      body: 'b',
      itineraryId: null,
      groupId: null,
      layout: 'mosaic',
      media,
    });

    await setPostHighlight(d, team, { postId: a.id, featured: true });

    const featured = await getCommunityFeed(d, team, { limit: 20, featuredOnly: true });
    expect(featured.map((p) => p.id)).toEqual([a.id]);
    expect(featured[0]!.featured).toBe(true);

    await expect(
      setPostHighlight(d, customer('rui'), { postId: a.id, featured: true }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('CO-10: o autor apaga o próprio comentário', () => {
  async function postComComentarios() {
    const d = deps();
    const post = await createPost(d, customer('ana'), {
      body: 'post com conversa',
      itineraryId: null,
      groupId: null,
      layout: 'mosaic',
      media,
    });
    const daAna = await commentOnPost(d, customer('ana'), { postId: post.id, body: 'meu' });
    const doRui = await commentOnPost(d, customer('rui'), { postId: post.id, body: 'do outro' });
    return { d, post, daAna, doRui };
  }

  it('some da lista do post e não derruba os outros', async () => {
    const { d, post, daAna, doRui } = await postComComentarios();

    await deleteOwnComment(d, customer('ana'), daAna.id);

    const restantes = await d.community.listComments('tenant-a', post.id);
    expect(restantes.map((c) => c.id)).toEqual([doRui.id]);
  });

  it('o comentário de outro cliente é recusado', async () => {
    const { d, doRui } = await postComComentarios();
    await expect(deleteOwnComment(d, customer('ana'), doRui.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('a equipe não apaga por aqui — moderação é outro caminho', async () => {
    const { d, daAna } = await postComComentarios();
    await expect(deleteOwnComment(d, team, daAna.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('comentário inexistente responde 404', async () => {
    const { d } = await postComComentarios();
    await expect(
      deleteOwnComment(d, customer('ana'), '00000000-0000-4000-8000-000000000000'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
