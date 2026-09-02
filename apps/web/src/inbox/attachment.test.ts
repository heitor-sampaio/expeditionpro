import { describe, expect, it } from 'vitest';
import { kindOf, semPrefixo, tamanhoAceito, LIMITE_BYTES } from './attachment.js';

/**
 * AT-13 — o que a tela precisa decidir antes de mandar um anexo.
 *
 * Três decisões pequenas e puras, e é onde estão os erros que aparecem tarde: o tipo errado
 * faz o WhatsApp mostrar uma foto como documento; o prefixo `data:` esquecido faz o provedor
 * recusar sem explicar; e um arquivo grande demais só falha depois de subir por um minuto.
 */
describe('AT-13: espécie do anexo', () => {
  it('imagem, vídeo e áudio saem do tipo do arquivo', () => {
    expect(kindOf('image/jpeg')).toBe('image');
    expect(kindOf('video/mp4')).toBe('video');
    expect(kindOf('audio/ogg')).toBe('audio');
  });

  /**
   * Tudo que não é mídia tocável vira documento, inclusive tipo desconhecido. É o único que o
   * WhatsApp mostra com nome de arquivo — que é o que salva um formato que ele não entende.
   */
  it('o resto é documento, inclusive o que não se reconhece', () => {
    expect(kindOf('application/pdf')).toBe('document');
    expect(kindOf('application/x-coisa-nova')).toBe('document');
    expect(kindOf('')).toBe('document');
  });

  it('tipo com parâmetro ainda é reconhecido — é como o navegador entrega gravação', () => {
    expect(kindOf('audio/webm;codecs=opus')).toBe('audio');
  });
});

describe('AT-13: o base64 que sobe', () => {
  /**
   * `FileReader` e a gravação devolvem `data:image/jpeg;base64,AAAA`. O provedor quer só o
   * conteúdo: mandar com o prefixo é recusa sem motivo legível.
   */
  it('tira o prefixo data: que o navegador põe', () => {
    expect(semPrefixo('data:image/jpeg;base64,QUJDRA==')).toBe('QUJDRA==');
  });

  it('conteúdo que já veio limpo passa intacto', () => {
    expect(semPrefixo('QUJDRA==')).toBe('QUJDRA==');
  });
});

describe('AT-13: tamanho', () => {
  it('arquivo dentro do limite passa', () => {
    expect(tamanhoAceito(5 * 1024 * 1024)).toBe(true);
  });

  it('acima do limite é barrado aqui, antes de subir', () => {
    expect(tamanhoAceito(LIMITE_BYTES + 1)).toBe(false);
  });

  it('arquivo vazio não passa — não há o que mandar', () => {
    expect(tamanhoAceito(0)).toBe(false);
  });
});
