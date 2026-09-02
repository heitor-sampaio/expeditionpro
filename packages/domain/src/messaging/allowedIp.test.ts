import { describe, expect, it } from 'vitest';
import { ipIsAllowed, parseAllowedIps } from './allowedIp.js';

/**
 * AT-02 — a origem como autenticação do webhook.
 *
 * Existe porque nem toda instalação da Evolution deixa configurar **nada** na chamada: nem
 * cabeçalho, nem corpo. Sobra quem está do outro lado da conexão. Não é um segredo — é uma
 * cerca: só o servidor da instância entra.
 *
 * O que ela protege é a **escrita**. Sem cerca nenhuma, qualquer um cria conversa falsa vinda
 * de qualquer número e pendura na ficha de um cliente real (AT-06). Não há leitura por essa
 * porta: o webhook só responde se tratou ou não.
 */
describe('AT-02: quem tem permissão de enviar', () => {
  it('o IP exato da lista entra', () => {
    expect(ipIsAllowed('69.62.88.81', ['69.62.88.81'])).toBe(true);
  });

  it('IP de fora não entra', () => {
    expect(ipIsAllowed('203.0.113.9', ['69.62.88.81'])).toBe(false);
  });

  it('mais de um endereço na lista — provedor com mais de uma saída', () => {
    expect(ipIsAllowed('69.62.88.82', ['69.62.88.81', '69.62.88.82'])).toBe(true);
  });

  /**
   * Lista vazia é **cerca desligada**, e por isso nunca autentica ninguém. Ela não pode virar
   * "todo mundo entra": um canal conectado sem preencher o campo continua exigindo o segredo,
   * e o padrão de quem esquece de configurar tem que ser o fechado.
   */
  it('lista vazia não libera ninguém', () => {
    expect(ipIsAllowed('69.62.88.81', [])).toBe(false);
  });

  /**
   * Atrás de proxy o mesmo endereço chega escrito de dois jeitos. Comparar texto cru deixaria
   * a cerca recusando o servidor certo, e o sintoma seria "parou de chegar mensagem".
   */
  it('IPv4 mapeado em IPv6 é o mesmo endereço', () => {
    expect(ipIsAllowed('::ffff:69.62.88.81', ['69.62.88.81'])).toBe(true);
    expect(ipIsAllowed('69.62.88.81', ['::ffff:69.62.88.81'])).toBe(true);
  });

  it('IPv6 compara sem ligar para caixa', () => {
    expect(ipIsAllowed('2001:DB8::1', ['2001:db8::1'])).toBe(true);
  });

  it('endereço vazio não entra em lista nenhuma', () => {
    expect(ipIsAllowed('', ['69.62.88.81'])).toBe(false);
  });
});

describe('AT-02: o que a equipe digita no campo', () => {
  it('aceita um endereço só', () => {
    expect(parseAllowedIps('69.62.88.81')).toEqual(['69.62.88.81']);
  });

  it('aceita vários, separados por vírgula, quebra de linha ou espaço', () => {
    expect(parseAllowedIps('69.62.88.81, 203.0.113.9\n2001:db8::1')).toEqual([
      '69.62.88.81',
      '203.0.113.9',
      '2001:db8::1',
    ]);
  });

  it('campo em branco é lista vazia — cerca desligada', () => {
    expect(parseAllowedIps('   ')).toEqual([]);
  });

  it('não repete o mesmo endereço', () => {
    expect(parseAllowedIps('69.62.88.81, 69.62.88.81')).toEqual(['69.62.88.81']);
  });

  /**
   * Recusa na borda em vez de guardar texto solto: um IP digitado errado vira uma cerca que
   * nunca deixa ninguém passar, e o sintoma aparece só quando a mensagem não chega.
   */
  it('o que não é endereço é recusado, dizendo qual', () => {
    expect(() => parseAllowedIps('69.62.88.81, evolution.meudominio.com')).toThrow(
      /evolution\.meudominio\.com/,
    );
  });

  it('endereço com número fora da faixa é recusado', () => {
    expect(() => parseAllowedIps('999.1.1.1')).toThrow(/999\.1\.1\.1/);
  });
});
