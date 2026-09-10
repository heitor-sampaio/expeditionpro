import { describe, expect, it } from 'vitest';
import { fonteDoGatilho, rotuloDaExecucao } from './fonteDoContexto.js';

/**
 * AU-25 — o que a tela oferece para ensaiar cada gatilho.
 *
 * Digitar era a única forma, e com dezoito campos no gatilho de recebimento isso deixou de ser
 * viável. Mas nem todo gatilho tem uma entidade para escolher: o de tempo em tempo é o relógio,
 * e o corpo de um webhook é de quem chama. Prometer um seletor onde não há o que selecionar
 * seria trocar um defeito por outro.
 */
describe('AU-25: de onde sai a amostra de cada gatilho', () => {
  it.each(['booking_created', 'booking_confirmed', 'booking_cancelled', 'payment_registered'])(
    '%s se ensaia com uma inscrição de verdade',
    (gatilho) => {
      expect(fonteDoGatilho(gatilho)).toBe('inscricao');
    },
  );

  /** AU-17: o gatilho de tempo não pende de entidade nenhuma — o contexto dele é o relógio. */
  it('de tempo em tempo monta sozinho', () => {
    expect(fonteDoGatilho('recurring')).toBe('agora');
  });

  /**
   * Conversa e cartão do funil ainda não têm montador no servidor. Dizer "digite" é honesto;
   * oferecer um seletor que não funciona seria pior que o formulário de hoje — e são gatilhos
   * de cinco campos, que é o que ninguém reclamou.
   */
  it.each(['message_received', 'opportunity_created', 'scheduled', 'webhook_received'])(
    '%s continua digitado',
    (gatilho) => {
      expect(fonteDoGatilho(gatilho)).toBe('manual');
    },
  );

  it('sem gatilho no quadro não há o que ensaiar', () => {
    expect(fonteDoGatilho(null)).toBe('manual');
  });
});

/**
 * AU-25 — como uma execução se apresenta na lista.
 *
 * Uma lista de uuids não é escolha, é sorteio. O rótulo diz quando rodou e como terminou, que é
 * o que faz alguém reconhecer a execução em que a mensagem saiu errada.
 */
describe('AU-25: o rótulo de uma execução', () => {
  const run = {
    createdAt: '2026-09-10T14:32:00.000Z',
    status: 'done' as const,
    temContextoDoGatilho: true,
  };

  it('diz quando rodou e como terminou', () => {
    expect(rotuloDaExecucao(run)).toContain('concluída');
  });

  /** Execução antiga fica na lista, desabilitada: sumir faria a lista parecer incompleta. */
  it('a que não guardou contexto diz por que não serve', () => {
    expect(rotuloDaExecucao({ ...run, temContextoDoGatilho: false })).toContain('sem contexto');
  });
});
