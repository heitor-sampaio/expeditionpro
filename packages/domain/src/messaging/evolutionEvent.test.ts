import { describe, expect, it } from 'vitest';
import { mapEvolutionEvent } from './evolutionEvent.js';

/**
 * AT-03 · AT-05 — o payload da Evolution vira mensagem, ou é ignorado.
 *
 * Puro: entra o corpo cru do webhook, sai o que interessa. É o mesmo desenho do
 * `mapAsaasEvent` e pela mesma razão — o provedor manda muito evento que não é nosso
 * assunto (status de entrega, presença, atualização de conexão), e reconhecer isso é regra,
 * não infraestrutura.
 *
 * **Ignorar não é erro.** O evento desconhecido responde 200 e some: devolver erro faria a
 * Evolution reenviar em laço para sempre, que é a mesma armadilha documentada no webhook do
 * ASAAS.
 */
describe('AT-03: mapeamento do evento da Evolution', () => {
  const mensagemRecebida = {
    event: 'messages.upsert',
    instance: 'drakkar',
    data: {
      key: {
        remoteJid: '5548999998877@s.whatsapp.net',
        fromMe: false,
        id: '3EB0C767D26A1D9B6F3A',
      },
      pushName: 'Ana Prado',
      message: { conversation: 'Bom dia! Quanto custa a Coxilha Rica?' },
      messageTimestamp: 1788000000,
    },
  };

  it('extrai id, telefone, texto, nome e horário', () => {
    expect(mapEvolutionEvent(mensagemRecebida)).toEqual({
      kind: 'message',
      externalId: '3EB0C767D26A1D9B6F3A',
      channelUserId: '5548999998877',
      direction: 'in',
      body: 'Bom dia! Quanto custa a Coxilha Rica?',
      displayName: 'Ana Prado',
      // 1788000000 segundos — o WhatsApp manda em segundos, e `Date` quer milissegundos.
      sentAt: new Date('2026-08-29T10:40:00.000Z'),
    });
  });

  it('mensagem enviada pelo próprio número vem marcada como saída', () => {
    /*
     * O celular pareado continua sendo usado à mão. Quando alguém responde pelo aparelho, a
     * Evolution avisa com `fromMe: true` — e ignorar isso deixaria a caixa contando só
     * metade da conversa, que é pior que não ter caixa.
     */
    const evento = mapEvolutionEvent({
      ...mensagemRecebida,
      data: { ...mensagemRecebida.data, key: { ...mensagemRecebida.data.key, fromMe: true } },
    });

    expect(evento).toMatchObject({ kind: 'message', direction: 'out' });
  });

  it('texto em `extendedTextMessage` também é texto — o formato muda quando há citação', () => {
    const evento = mapEvolutionEvent({
      ...mensagemRecebida,
      data: {
        ...mensagemRecebida.data,
        message: { extendedTextMessage: { text: 'e para dezembro?' } },
      },
    });

    expect(evento).toMatchObject({ kind: 'message', body: 'e para dezembro?' });
  });

  it('mensagem de grupo é ignorada — atendimento é conversa de um para um', () => {
    const evento = mapEvolutionEvent({
      ...mensagemRecebida,
      data: {
        ...mensagemRecebida.data,
        key: { ...mensagemRecebida.data.key, remoteJid: '120363000000000000@g.us' },
      },
    });

    expect(evento).toEqual({ kind: 'ignored' });
  });

  it('mídia sem texto vira aviso, não conteúdo (AT-13)', () => {
    /*
     * Baixar a mídia exige caminho no servidor, que é fase posterior. Até lá, a caixa diz
     * que veio uma foto em vez de mostrar uma mensagem vazia — sumir com a mensagem faria a
     * conversa perder o fio.
     */
    const evento = mapEvolutionEvent({
      ...mensagemRecebida,
      data: {
        ...mensagemRecebida.data,
        message: { imageMessage: { mimetype: 'image/jpeg' } },
      },
    });

    expect(evento).toMatchObject({ kind: 'message', body: '[imagem]' });
  });

  it.each([
    ['evento que não é mensagem', { event: 'connection.update', data: {} }],
    ['corpo vazio', {}],
    ['nulo', null],
    [
      'sem id da mensagem',
      { event: 'messages.upsert', data: { key: { remoteJid: 'x@s.whatsapp.net' } } },
    ],
  ])('%s é ignorado, não quebra', (_nome, corpo) => {
    expect(mapEvolutionEvent(corpo)).toEqual({ kind: 'ignored' });
  });
});
