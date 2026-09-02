import { describe, expect, it } from 'vitest';
import { evolutionGateway } from './evolutionGateway.js';
import type { ChannelIntegrationRecord } from '@expedition/application';

/**
 * AT-08 — a Evolution de verdade, por HTTP.
 *
 * Único lugar do sistema que conhece o formato da API deles. Duas coisas ficam contidas aqui:
 * o endereço da instância entra na URL (não é host fixo, cada tenant hospeda a sua) e a chave
 * vai no cabeçalho `apikey`, que é como a Evolution autentica.
 *
 * O `fetch` é injetado, como no `asaasGateway`: testar chamada de saída não precisa de rede.
 */

const INTEGRACAO: ChannelIntegrationRecord = {
  id: 'ch-1',
  channel: 'whatsapp',
  provider: 'evolution',
  baseUrl: 'https://evo.exemplo.app',
  externalAccountId: 'drakkar',
  accessToken: 'CHAVE-DA-INSTANCIA',
  allowedIps: [],
  active: true,
  connectedAt: new Date('2026-09-01T00:00:00Z'),
};

function fetchFalso(resposta: { status: number; body: unknown }) {
  const chamadas: { url: string; init: RequestInit }[] = [];
  const impl = ((url: string, init: RequestInit) => {
    chamadas.push({ url, init });
    return Promise.resolve({
      ok: resposta.status >= 200 && resposta.status < 300,
      status: resposta.status,
      json: () => Promise.resolve(resposta.body),
    } as Response);
  }) as unknown as typeof fetch;
  return { impl, chamadas };
}

const OK = { body: { key: { id: 'BAE5F0C1', remoteJid: '5548999998877@s.whatsapp.net' } } };

describe('AT-08: envio pela Evolution', () => {
  it('chama a instância do tenant, com a chave no cabeçalho', async () => {
    const { impl, chamadas } = fetchFalso({ status: 201, ...OK });

    await evolutionGateway(impl).sendText({
      integration: INTEGRACAO,
      to: '5548999998877',
      text: 'Bom dia!',
    });

    expect(chamadas[0]?.url).toBe('https://evo.exemplo.app/message/sendText/drakkar');
    expect((chamadas[0]?.init.headers as Record<string, string>)['apikey']).toBe(
      'CHAVE-DA-INSTANCIA',
    );
    expect(JSON.parse(String(chamadas[0]?.init.body))).toEqual({
      number: '5548999998877',
      text: 'Bom dia!',
    });
  });

  it('devolve o id da mensagem — é a marca que o eco vai trazer (AT-03)', async () => {
    const { impl } = fetchFalso({ status: 201, ...OK });

    const resultado = await evolutionGateway(impl).sendText({
      integration: INTEGRACAO,
      to: '5548999998877',
      text: 'oi',
    });

    expect(resultado).toEqual({ ok: true, externalId: 'BAE5F0C1' });
  });

  /**
   * O motivo do provedor precisa chegar até a tela. A diferença entre "número não existe no
   * WhatsApp" e "instância desconectada" é a diferença entre corrigir o contato e ir religar
   * a instância — e sem o texto deles não dá para saber qual é.
   */
  it('recusa do provedor volta com o motivo dele', async () => {
    const { impl } = fetchFalso({
      status: 400,
      body: { message: 'number not exists on whatsapp' },
    });

    const resultado = await evolutionGateway(impl).sendText({
      integration: INTEGRACAO,
      to: '5548000000000',
      text: 'oi',
    });

    expect(resultado.ok).toBe(false);
    expect(resultado).toMatchObject({ detail: expect.stringContaining('number not exists') });
  });

  it('sem corpo legível, o motivo é o status — melhor que "erro desconhecido"', async () => {
    const { impl } = fetchFalso({ status: 502, body: null });

    const resultado = await evolutionGateway(impl).sendText({
      integration: INTEGRACAO,
      to: '5548999998877',
      text: 'oi',
    });

    expect(resultado).toMatchObject({ ok: false, detail: expect.stringContaining('502') });
  });

  /**
   * Resposta com 200 e sem id acontece quando a versão da API não é a esperada. Guardar a
   * mensagem sem id quebraria a idempotência do eco: ela apareceria de novo pelo webhook.
   */
  it('resposta sem id de mensagem é tratada como falha', async () => {
    const { impl } = fetchFalso({ status: 200, body: { status: 'PENDING' } });

    const resultado = await evolutionGateway(impl).sendText({
      integration: INTEGRACAO,
      to: '5548999998877',
      text: 'oi',
    });

    expect(resultado.ok).toBe(false);
  });

  it('barra sobrando no endereço não vira barra dupla', async () => {
    const { impl, chamadas } = fetchFalso({ status: 201, ...OK });

    await evolutionGateway(impl).sendText({
      integration: { ...INTEGRACAO, baseUrl: 'https://evo.exemplo.app/' },
      to: '5548999998877',
      text: 'oi',
    });

    expect(chamadas[0]?.url).toBe('https://evo.exemplo.app/message/sendText/drakkar');
  });

  it('provedor fora do ar não derruba a requisição — volta como recusa', async () => {
    const impl = (() => Promise.reject(new Error('fetch failed'))) as unknown as typeof fetch;

    const resultado = await evolutionGateway(impl).sendText({
      integration: INTEGRACAO,
      to: '5548999998877',
      text: 'oi',
    });

    expect(resultado).toMatchObject({ ok: false });
  });
});

/**
 * AT-13 — anexo pela Evolution. São **dois** endpoints, e não um com parâmetro:
 *
 * - `sendMedia` para imagem, vídeo e documento;
 * - `sendWhatsAppAudio` para áudio, que no WhatsApp é mensagem de voz — outro tipo de coisa,
 *   com outra aparência no aparelho e sem legenda.
 *
 * Mandar voz pelo `sendMedia` chega como anexo de áudio, com cara de arquivo. É diferença que
 * quem recebe percebe na hora.
 */
describe('AT-13: envio de anexo pela Evolution', () => {
  it('imagem vai pelo sendMedia, com tipo e legenda', async () => {
    const { impl, chamadas } = fetchFalso({ status: 201, ...OK });

    await evolutionGateway(impl).sendMedia({
      integration: INTEGRACAO,
      to: '5548999998877',
      kind: 'image',
      mimeType: 'image/jpeg',
      fileName: 'pneu.jpg',
      caption: 'olha como ficou',
      base64: 'QUJDRA==',
    });

    expect(chamadas[0]?.url).toBe('https://evo.exemplo.app/message/sendMedia/drakkar');
    expect(JSON.parse(String(chamadas[0]?.init.body))).toEqual({
      number: '5548999998877',
      mediatype: 'image',
      mimetype: 'image/jpeg',
      media: 'QUJDRA==',
      fileName: 'pneu.jpg',
      caption: 'olha como ficou',
    });
  });

  it('documento sem nome ganha um, porque o WhatsApp mostra o nome do arquivo', async () => {
    const { impl, chamadas } = fetchFalso({ status: 201, ...OK });

    await evolutionGateway(impl).sendMedia({
      integration: INTEGRACAO,
      to: '5548999998877',
      kind: 'document',
      mimeType: 'application/pdf',
      fileName: null,
      caption: null,
      base64: 'QUJDRA==',
    });

    const corpo = JSON.parse(String(chamadas[0]?.init.body)) as { fileName: string };
    expect(corpo.fileName).toBe('arquivo.pdf');
  });

  it('áudio vai pelo endpoint de voz, que é outra coisa no aparelho', async () => {
    const { impl, chamadas } = fetchFalso({ status: 201, ...OK });

    await evolutionGateway(impl).sendMedia({
      integration: INTEGRACAO,
      to: '5548999998877',
      kind: 'audio',
      mimeType: 'audio/ogg',
      fileName: null,
      caption: null,
      base64: 'QUJDRA==',
    });

    expect(chamadas[0]?.url).toBe('https://evo.exemplo.app/message/sendWhatsAppAudio/drakkar');
    expect(JSON.parse(String(chamadas[0]?.init.body))).toEqual({
      number: '5548999998877',
      audio: 'QUJDRA==',
    });
  });

  it('devolve o id da mensagem, como o texto', async () => {
    const { impl } = fetchFalso({ status: 201, ...OK });

    const r = await evolutionGateway(impl).sendMedia({
      integration: INTEGRACAO,
      to: '5548999998877',
      kind: 'image',
      mimeType: 'image/jpeg',
      fileName: null,
      caption: null,
      base64: 'QUJDRA==',
    });

    expect(r).toEqual({ ok: true, externalId: 'BAE5F0C1' });
  });

  it('recusa volta com o motivo do provedor', async () => {
    const { impl } = fetchFalso({ status: 400, body: { message: 'file too large' } });

    const r = await evolutionGateway(impl).sendMedia({
      integration: INTEGRACAO,
      to: '5548999998877',
      kind: 'video',
      mimeType: 'video/mp4',
      fileName: null,
      caption: null,
      base64: 'QUJDRA==',
    });

    expect(r).toMatchObject({ ok: false, detail: expect.stringContaining('file too large') });
  });
});
