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
      phone: '5548999998877',
      media: null,
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

/**
 * AT-05 — `pushName` é o nome de perfil de **quem mandou**, e em mensagem que sai quem mandou
 * somos nós.
 *
 * Bug visto em produção: todos os contatos apareciam com o nome da empresa. A causa é esta —
 * o eco da própria resposta (e a resposta digitada no celular pareado) chega com `fromMe:
 * true` e o `pushName` da instância, e o nome da conversa era sobrescrito com ele. Uma
 * conversa por cliente virava "Drakkar Expedições" assim que alguém respondia.
 *
 * A regra fica aqui, e não em quem grava: quem sabe o que `pushName` significa em cada evento
 * é o mapeador do provedor.
 */
describe('AT-05: nome do perfil só vale quando é da outra pessoa', () => {
  const saindo = {
    event: 'messages.upsert',
    data: {
      key: { id: 'MSG-9', remoteJid: '5548999998877@s.whatsapp.net', fromMe: true },
      pushName: 'Drakkar Expedições',
      message: { conversation: 'Bom dia! Vou te passar os valores.' },
      messageTimestamp: 1788000000,
    },
  };

  it('mensagem que sai não traz nome de contato — o perfil ali é o nosso', () => {
    const evento = mapEvolutionEvent(saindo);

    expect(evento).toMatchObject({ kind: 'message', direction: 'out', displayName: null });
  });

  it('mensagem que entra continua trazendo o nome de quem escreveu', () => {
    const evento = mapEvolutionEvent({
      ...saindo,
      data: { ...saindo.data, key: { ...saindo.data.key, fromMe: false }, pushName: 'Ana Prado' },
    });

    expect(evento).toMatchObject({ direction: 'in', displayName: 'Ana Prado' });
  });
});

/**
 * AT-05 — a identidade do contato no WhatsApp está no meio de uma migração.
 *
 * O WhatsApp está trocando o endereçamento por telefone (`@s.whatsapp.net`) pelo **LID**
 * (`@lid`), um id da conta que não é o número. A instância já anuncia isso em
 * `key.addressingMode`, e manda os dois endereços: um em `remoteJid`, o outro em
 * `remoteJidAlt`. Qual vai em qual **varia**.
 *
 * Dois riscos, e os dois apareceriam sem aviso:
 *
 * - mensagem endereçada por `@lid` era **descartada em silêncio**, porque o mapeador só
 *   aceitava `@s.whatsapp.net`. A caixa simplesmente pararia de receber;
 * - o mesmo contato chegando ora por um, ora por outro viraria **duas conversas**.
 *
 * Daí o mapeador devolver os dois: o LID é a identidade (é o que não muda), e o telefone
 * continua existindo porque é o que disca, o que casa com a ficha do cliente (AT-06) e o
 * único dos dois que uma pessoa reconhece na tela.
 */
describe('AT-05: LID e telefone são a mesma pessoa', () => {
  const evento = (key: Record<string, unknown>) => ({
    event: 'messages.upsert',
    data: {
      key: { id: 'MSG-1', fromMe: false, ...key },
      pushName: 'Ana Prado',
      message: { conversation: 'oi' },
      messageTimestamp: 1788000000,
    },
  });

  it('só telefone: a identidade é o telefone', () => {
    const r = mapEvolutionEvent(
      evento({
        remoteJid: '5548999998877@s.whatsapp.net',
        remoteJidAlt: '5548999998877@s.whatsapp.net',
      }),
    );

    expect(r).toMatchObject({ channelUserId: '5548999998877', phone: '5548999998877' });
  });

  it('LID no remoteJid: a identidade é o LID, e o telefone vem do alternativo', () => {
    const r = mapEvolutionEvent(
      evento({ remoteJid: '187654321098765@lid', remoteJidAlt: '5548999998877@s.whatsapp.net' }),
    );

    expect(r).toMatchObject({ channelUserId: '187654321098765', phone: '5548999998877' });
  });

  it('LID no alternativo: a ordem dos campos não decide nada', () => {
    const r = mapEvolutionEvent(
      evento({ remoteJid: '5548999998877@s.whatsapp.net', remoteJidAlt: '187654321098765@lid' }),
    );

    expect(r).toMatchObject({ channelUserId: '187654321098765', phone: '5548999998877' });
  });

  it('só LID: entra sem telefone — e continua sendo uma conversa', () => {
    const r = mapEvolutionEvent(evento({ remoteJid: '187654321098765@lid' }));

    expect(r).toMatchObject({ channelUserId: '187654321098765', phone: null });
  });

  it('grupo continua fora: muitos autores, nenhum dono', () => {
    expect(mapEvolutionEvent(evento({ remoteJid: '120363000000000000@g.us' }))).toEqual({
      kind: 'ignored',
    });
  });

  it('endereço de tipo desconhecido é ignorado, não vira contato torto', () => {
    expect(mapEvolutionEvent(evento({ remoteJid: 'algo@broadcast' }))).toEqual({
      kind: 'ignored',
    });
  });
});

/**
 * AT-13 — a mídia que o lead manda.
 *
 * A instalação daqui entrega o arquivo **dentro do webhook**, em `message.base64` — verificado
 * no corpo cru de uma imagem que chegou de verdade (515 KB de foto, 687 KB de base64). Então
 * não há segunda chamada ao provedor: o que precisa ser guardado já veio.
 *
 * A legenda vira o corpo da mensagem quando existe. Foto com legenda é uma frase com uma
 * imagem junto, e jogar a frase fora deixaria a conversa sem sentido — foi o que o marcador
 * `[imagem]` fazia até aqui.
 */
describe('AT-13: mídia recebida', () => {
  const comMidia = (tipo: string, conteudo: Record<string, unknown>) => ({
    event: 'messages.upsert',
    data: {
      key: { id: 'MSG-M', fromMe: false, remoteJid: '5548999998877@s.whatsapp.net' },
      pushName: 'Ana Prado',
      messageType: tipo,
      message: { [tipo]: conteudo, base64: 'QUJD' },
      messageTimestamp: 1788000000,
    },
  });

  it('imagem vem com o arquivo, o tipo e o formato', () => {
    const r = mapEvolutionEvent(comMidia('imageMessage', { mimetype: 'image/jpeg' }));

    expect(r).toMatchObject({
      body: '[imagem]',
      media: { kind: 'image', mimeType: 'image/jpeg', fileName: null, base64: 'QUJD' },
    });
  });

  it('a legenda vira o texto da mensagem — é o que a pessoa quis dizer', () => {
    const r = mapEvolutionEvent(
      comMidia('imageMessage', { mimetype: 'image/jpeg', caption: 'olha o estrago no pneu' }),
    );

    expect(r).toMatchObject({ body: 'olha o estrago no pneu' });
  });

  it('vídeo, áudio e documento entram do mesmo jeito', () => {
    expect(mapEvolutionEvent(comMidia('videoMessage', { mimetype: 'video/mp4' }))).toMatchObject({
      media: { kind: 'video', mimeType: 'video/mp4' },
    });
    expect(mapEvolutionEvent(comMidia('audioMessage', { mimetype: 'audio/ogg' }))).toMatchObject({
      media: { kind: 'audio', mimeType: 'audio/ogg' },
    });
    expect(
      mapEvolutionEvent(
        comMidia('documentMessage', {
          mimetype: 'application/pdf',
          fileName: 'orçamento.pdf',
        }),
      ),
    ).toMatchObject({ media: { kind: 'document', fileName: 'orçamento.pdf' } });
  });

  /**
   * Sem o arquivo no corpo, a mensagem **continua entrando** — só sem mídia. Sumir com ela
   * deixaria um buraco no fio, e quem lê não saberia que alguma coisa foi mandada.
   */
  it('mídia sem o arquivo vira mensagem com marcador, e não some', () => {
    const r = mapEvolutionEvent({
      event: 'messages.upsert',
      data: {
        key: { id: 'MSG-M', fromMe: false, remoteJid: '5548999998877@s.whatsapp.net' },
        messageType: 'imageMessage',
        message: { imageMessage: { mimetype: 'image/jpeg' } },
        messageTimestamp: 1788000000,
      },
    });

    expect(r).toMatchObject({ body: '[imagem]', media: null });
  });

  it('sem o tipo do arquivo, guarda como binário genérico em vez de recusar', () => {
    const r = mapEvolutionEvent(comMidia('documentMessage', {}));

    expect(r).toMatchObject({ media: { mimeType: 'application/octet-stream' } });
  });

  it('mensagem de texto continua sem mídia nenhuma', () => {
    const texto = {
      event: 'messages.upsert',
      data: {
        key: { id: 'MSG-T', fromMe: false, remoteJid: '5548999998877@s.whatsapp.net' },
        message: { conversation: 'oi' },
        messageTimestamp: 1788000000,
      },
    };

    expect(mapEvolutionEvent(texto)).toMatchObject({ media: null });
  });
});
