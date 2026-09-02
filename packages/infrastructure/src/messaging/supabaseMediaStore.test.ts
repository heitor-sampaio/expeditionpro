import { describe, expect, it } from 'vitest';
import { supabaseMediaStore } from './supabaseMediaStore.js';

/**
 * AT-13 — o bucket privado das conversas, pela API REST do Storage.
 *
 * Mesmo desenho do `supabaseAuthAdmin`: `fetch` cru com a chave de serviço, sem SDK. Guardar
 * arquivo não pode derrubar a mensagem, então **nada aqui lança** — falha vira `null`, e quem
 * chama grava a mensagem com o marcador de anexo.
 */

const ARQUIVO = {
  tenantId: 'tenant-a',
  conversationId: 'conv-1',
  externalId: 'MSG-IMG',
  mimeType: 'image/jpeg',
  fileName: null,
  // "ABCD" em base64.
  base64: 'QUJDRA==',
};

function fetchFalso(respostas: { status: number; body?: unknown }[]) {
  const chamadas: { url: string; init: RequestInit }[] = [];
  let i = 0;
  const impl = ((url: string, init: RequestInit) => {
    chamadas.push({ url, init });
    const resposta = respostas[Math.min(i, respostas.length - 1)]!;
    i += 1;
    return Promise.resolve({
      ok: resposta.status >= 200 && resposta.status < 300,
      status: resposta.status,
      json: () => Promise.resolve(resposta.body ?? null),
    } as Response);
  }) as unknown as typeof fetch;
  return { impl, chamadas };
}

const config = { url: 'https://projeto.supabase.co', serviceRoleKey: 'CHAVE-DE-SERVICO' };

describe('AT-13: guardar o anexo', () => {
  it('sobe para o bucket privado, num caminho por tenant e conversa', async () => {
    const { impl, chamadas } = fetchFalso([{ status: 200 }]);

    const guardado = await supabaseMediaStore({ ...config, fetchImpl: impl }).save(ARQUIVO);

    expect(chamadas[0]?.url).toBe(
      'https://projeto.supabase.co/storage/v1/object/conversations/tenant-a/conv-1/MSG-IMG.jpg',
    );
    expect(guardado).toEqual({ path: 'tenant-a/conv-1/MSG-IMG.jpg', sizeBytes: 4 });
  });

  it('vai com a chave de serviço e o tipo do arquivo', async () => {
    const { impl, chamadas } = fetchFalso([{ status: 200 }]);

    await supabaseMediaStore({ ...config, fetchImpl: impl }).save(ARQUIVO);

    const headers = chamadas[0]?.init.headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer CHAVE-DE-SERVICO');
    expect(headers['content-type']).toBe('image/jpeg');
  });

  it('a extensão sai do tipo do arquivo, e não do nome que o remetente escolheu', async () => {
    const { impl, chamadas } = fetchFalso([{ status: 200 }]);

    await supabaseMediaStore({ ...config, fetchImpl: impl }).save({
      ...ARQUIVO,
      mimeType: 'application/pdf',
      fileName: '../../etc/passwd',
    });

    expect(chamadas[0]?.url).toMatch(/MSG-IMG\.pdf$/);
  });

  it('tipo desconhecido ainda sobe, sem extensão', async () => {
    const { impl, chamadas } = fetchFalso([{ status: 200 }]);

    await supabaseMediaStore({ ...config, fetchImpl: impl }).save({
      ...ARQUIVO,
      mimeType: 'application/x-coisa',
    });

    expect(chamadas[0]?.url).toMatch(/MSG-IMG$/);
  });

  it('recusa do Storage devolve null — a mensagem entra sem o anexo', async () => {
    const { impl } = fetchFalso([{ status: 413 }]);

    expect(await supabaseMediaStore({ ...config, fetchImpl: impl }).save(ARQUIVO)).toBeNull();
  });

  it('Storage fora do ar também devolve null, sem derrubar quem chamou', async () => {
    const impl = (() => Promise.reject(new Error('fetch failed'))) as unknown as typeof fetch;

    expect(await supabaseMediaStore({ ...config, fetchImpl: impl }).save(ARQUIVO)).toBeNull();
  });

  /**
   * Arquivo grande demais é recusado **antes** de subir. O WhatsApp já limita o que passa por
   * ele; o teto aqui existe para uma instalação com limite diferente não virar um objeto de
   * centenas de megabytes no bucket, cobrado por mês.
   */
  it('arquivo acima do teto não sobe', async () => {
    const { impl, chamadas } = fetchFalso([{ status: 200 }]);

    const gigante = { ...ARQUIVO, base64: 'A'.repeat(120 * 1024 * 1024) };
    expect(await supabaseMediaStore({ ...config, fetchImpl: impl }).save(gigante)).toBeNull();
    expect(chamadas).toHaveLength(0);
  });
});

describe('AT-13: mostrar o anexo', () => {
  it('assina todos os caminhos numa chamada só', async () => {
    const { impl, chamadas } = fetchFalso([
      {
        status: 200,
        body: [
          { path: 'a/b/1.jpg', signedURL: '/object/sign/conversations/a/b/1.jpg?token=xyz' },
          { path: 'a/b/2.jpg', signedURL: '/object/sign/conversations/a/b/2.jpg?token=abc' },
        ],
      },
    ]);

    const urls = await supabaseMediaStore({ ...config, fetchImpl: impl }).signedUrls(
      ['a/b/1.jpg', 'a/b/2.jpg'],
      600,
    );

    expect(chamadas).toHaveLength(1);
    expect(urls.get('a/b/1.jpg')).toBe(
      'https://projeto.supabase.co/storage/v1/object/sign/conversations/a/b/1.jpg?token=xyz',
    );
  });

  it('falha ao assinar devolve mapa vazio — o fio aparece sem as imagens', async () => {
    const { impl } = fetchFalso([{ status: 500 }]);

    const urls = await supabaseMediaStore({ ...config, fetchImpl: impl }).signedUrls(['a/b'], 600);

    expect(urls.size).toBe(0);
  });

  it('sem caminho nenhum, não chama o Storage', async () => {
    const { impl, chamadas } = fetchFalso([{ status: 200 }]);

    await supabaseMediaStore({ ...config, fetchImpl: impl }).signedUrls([], 600);

    expect(chamadas).toHaveLength(0);
  });
});
