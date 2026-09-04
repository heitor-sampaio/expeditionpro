import { describe, expect, it } from 'vitest';
import { runUserCode } from './runUserCode.js';

/**
 * AU-23 — o nó de código.
 *
 * É a única parte do sistema onde a equipe escreve o que o servidor vai executar, e por isso o
 * que se cobra aqui não é o caminho feliz: é o que o código **não** alcança. Cada teste desta
 * suíte é uma porta que já foi usada para sair de uma caixa de areia em JavaScript.
 */
describe('AU-23: o nó de código', () => {
  it('devolve o objeto que o código retornou', () => {
    expect(runUserCode('return { total: 2 + 3 };', {})).toEqual({ total: 5 });
  });

  it('enxerga as variáveis da execução em `dados`', () => {
    const saida = runUserCode('return { nome: dados.contato.nome.toUpperCase() };', {
      contato: { nome: 'ana' },
    });
    expect(saida).toEqual({ nome: 'ANA' });
  });

  it('recusa código que não devolve objeto — o retorno vira variável, e variável é objeto', () => {
    expect(() => runUserCode('return 42;', {})).toThrow(/objeto/i);
    expect(() => runUserCode('return null;', {})).toThrow(/objeto/i);
    expect(() => runUserCode('const x = 1;', {})).toThrow(/objeto/i);
  });

  it('recusa código vazio, dizendo o que falta', () => {
    expect(() => runUserCode('   ', {})).toThrow(/sem código/i);
  });

  it('deixa o erro do código chegar com a mensagem que ele deu', () => {
    expect(() => runUserCode('throw new Error("faltou o cpf");', {})).toThrow('faltou o cpf');
  });

  it('não alcança `require`, `process`, `fetch` nem o módulo do servidor', () => {
    for (const nome of ['require', 'process', 'fetch', 'global', 'setTimeout']) {
      expect(() => runUserCode(`return { v: ${nome} };`, {})).toThrow();
    }
  });

  it('o global do sandbox está vazio: `globalThis.process` não é o do servidor', () => {
    expect(runUserCode('return { tem: globalThis.process === undefined };', {})).toEqual({
      tem: true,
    });
  });
  it('não alcança o host pelo construtor de função, a saída clássica da caixa de areia', () => {
    expect(() =>
      runUserCode('return ({}).constructor.constructor("return process")();', {}),
    ).toThrow();
  });

  it('para o laço infinito no prazo, em vez de travar a fila atrás dele', () => {
    expect(() => runUserCode('while (true) {}', {}, { timeoutMs: 50 })).toThrow(/tempo/i);
  });

  it('recusa código longo demais para ser um nó de fluxo', () => {
    expect(() => runUserCode(`return { x: "${'a'.repeat(21_000)}" };`, {})).toThrow(/longo/i);
  });

  it('o que o código mexe em `dados` não volta para o contexto da execução', () => {
    const variaveis = { contato: { nome: 'Ana' } };
    runUserCode('dados.contato.nome = "invadido"; return { ok: true };', variaveis);
    expect(variaveis.contato.nome).toBe('Ana');
  });

  it('descarta do retorno o que não atravessa JSON — o contexto é salvo no banco', () => {
    expect(runUserCode('return { f: function () {}, n: 1 };', {})).toEqual({ n: 1 });
  });
});
