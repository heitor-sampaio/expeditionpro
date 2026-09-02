import { describe, expect, it } from 'vitest';
import { SIGNED_URL_TTL_SECONDS } from './signedUrlTtl.js';

/**
 * SEC — a URL assinada é uma credencial portátil, e credencial portátil tem prazo curto.
 *
 * Quem tem a URL abre a foto do bucket privado sem sessão, sem tenant e sem nada. Ela
 * escapa pelos caminhos de sempre: histórico do navegador, cabeçalho `Referer`, log de
 * proxy corporativo, print de tela com a barra de endereço à mostra.
 *
 * Era 3600 — uma hora —, escrito à mão em dois lugares diferentes, sob um comentário que
 * dizia "curta validade". O número não precisa ser exatamente este; o que este teste
 * protege é o **teto**, porque a próxima pessoa a mexer aqui vai estar depurando uma imagem
 * que não carregou, e aumentar o prazo é a primeira ideia que ocorre a qualquer um.
 *
 * O prazo só precisa cobrir o carregamento da imagem: o `src` é resolvido na montagem do
 * componente e o navegador guarda o que já baixou.
 */
describe('SEC: validade da URL assinada de Storage', () => {
  it('não passa de cinco minutos', () => {
    expect(SIGNED_URL_TTL_SECONDS).toBeLessThanOrEqual(300);
  });

  it('é longa o bastante para a imagem carregar em rede ruim', () => {
    expect(SIGNED_URL_TTL_SECONDS).toBeGreaterThanOrEqual(60);
  });
});
