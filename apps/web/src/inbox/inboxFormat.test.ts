import { describe, expect, it } from 'vitest';
import { channelLabel, contactTitle, iniciais } from './inboxFormat.js';

describe('AT-07: como a caixa identifica quem está do outro lado', () => {
  it('mostra o nome do perfil quando o provedor mandou um', () => {
    expect(
      contactTitle({ channel: 'whatsapp', channelUserId: '5548999998877', displayName: 'Ana' }),
    ).toBe('Ana');
  });

  it('sem nome no WhatsApp, mostra o telefone formatado — número cru ninguém reconhece', () => {
    expect(
      contactTitle({ channel: 'whatsapp', channelUserId: '5548999998877', displayName: null }),
    ).toBe('+55 (48)99999-8877');
  });

  /**
   * O id do Instagram e do Messenger é opaco **por aplicativo**: não é telefone, não é
   * @arroba, e não abre nada. Formatá-lo fingiria que significa alguma coisa.
   */
  it('sem nome fora do WhatsApp, diz que o contato não se identificou', () => {
    expect(
      contactTitle({ channel: 'instagram', channelUserId: '178414000', displayName: null }),
    ).toBe('Contato do Instagram');
  });

  it('o canal aparece pelo nome próprio', () => {
    expect(channelLabel('whatsapp')).toBe('WhatsApp');
    expect(channelLabel('instagram')).toBe('Instagram');
    expect(channelLabel('messenger')).toBe('Messenger');
  });

  it('a inicial do avatar vem do nome, e nunca fica vazia', () => {
    expect(iniciais('Ana Prado')).toBe('AP');
    expect(iniciais('Contato do Instagram')).toBe('CI');
    expect(iniciais('')).toBe('?');
  });
});
