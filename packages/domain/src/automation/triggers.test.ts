import { describe, expect, it } from 'vitest';
import { CAMPOS_DO_GATILHO, contextFieldsFor, TRIGGER_TYPES } from './triggers.js';

/**
 * AU-16 — o que cada gatilho põe no contexto.
 *
 * Existe porque quem desenha a automação hoje precisa **adivinhar** o nome do campo: escreve
 * `contato.nome` de memória, erra `contato.telefone` para `contato.fone`, e a variável ausente
 * vira vazio em silêncio (AU-09) — a mensagem sai sem o nome e ninguém descobre.
 *
 * O catálogo é dado puro, no domínio, porque as duas pontas precisam dele: a tela oferece a
 * lista, e o teste da borda cobra que o contexto disparado tenha o que aqui está prometido.
 */

describe('AU-16: todo gatilho diz quais campos oferece', () => {
  it('nenhum gatilho fica sem catálogo', () => {
    for (const gatilho of TRIGGER_TYPES) {
      expect(CAMPOS_DO_GATILHO[gatilho].length).toBeGreaterThan(0);
    }
  });

  /** Caminho repetido viraria duas linhas iguais no seletor, e uma delas é engano. */
  it('não há caminho repetido dentro de um gatilho', () => {
    for (const gatilho of TRIGGER_TYPES) {
      const caminhos = CAMPOS_DO_GATILHO[gatilho].map((campo) => campo.path);
      expect(new Set(caminhos).size).toBe(caminhos.length);
    }
  });

  it('mensagem recebida traz o texto e quem escreveu', () => {
    const caminhos = CAMPOS_DO_GATILHO.message_received.map((campo) => campo.path);
    expect(caminhos).toContain('mensagem.texto');
    expect(caminhos).toContain('contato.nome');
    expect(caminhos).toContain('contato.telefone');
  });

  it('o gatilho temporal traz a saída, e não contato nenhum', () => {
    const caminhos = CAMPOS_DO_GATILHO.scheduled.map((campo) => campo.path);
    expect(caminhos).toContain('saida.nome');
    expect(caminhos.some((caminho) => caminho.startsWith('contato.'))).toBe(false);
  });
});

describe('AU-16: os campos do gatilho escolhido', () => {
  it('devolve o catálogo do gatilho', () => {
    expect(contextFieldsFor('scheduled')).toEqual(CAMPOS_DO_GATILHO.scheduled);
  });

  /** Rascunho ainda sem gatilho no quadro: não há contexto para prometer. */
  it('automação sem gatilho não oferece campo nenhum', () => {
    expect(contextFieldsFor(null)).toEqual([]);
  });
});

/**
 * AU-17 — os gatilhos que faltavam.
 *
 * "Mensagem enviada" e "inscrição cancelada" são acontecimentos que a equipe já vivia e não
 * podia reagir a eles. O de tempo em tempo é de outra natureza: não pende de entidade nenhuma,
 * e por isso não traz contato nem inscrição — o contexto dele é o relógio.
 */
describe('AU-17: gatilhos novos', () => {
  it('mensagem enviada traz o texto e a conversa', () => {
    const caminhos = CAMPOS_DO_GATILHO.message_sent.map((campo) => campo.path);
    expect(caminhos).toContain('mensagem.texto');
    expect(caminhos).toContain('conversa.id');
  });

  /** O motivo é o que faz "cancelou por desistência" ser diferente de "cancelou por chuva". */
  it('inscrição cancelada traz o motivo', () => {
    const caminhos = CAMPOS_DO_GATILHO.booking_cancelled.map((campo) => campo.path);
    expect(caminhos).toContain('inscricao.id');
    expect(caminhos).toContain('inscricao.motivo');
  });

  it('de tempos em tempos traz o relógio, e nada de contato ou inscrição', () => {
    const caminhos = CAMPOS_DO_GATILHO.recurring.map((campo) => campo.path);
    expect(caminhos).toContain('agora.data');
    expect(caminhos).toContain('agora.hora');
    expect(caminhos.some((c) => c.startsWith('contato.') || c.startsWith('inscricao.'))).toBe(
      false,
    );
  });
});
