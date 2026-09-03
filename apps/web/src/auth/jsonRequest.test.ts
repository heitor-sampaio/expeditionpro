import { describe, expect, it } from 'vitest';
import { semCorpoSemTipo } from './jsonRequest.js';

/**
 * O bug que esta função existe para impedir: **apagar não apagava**.
 *
 * Os hooks põem `content-type: application/json` em toda chamada, porque quase toda tem corpo.
 * No `DELETE` não tem — e o Fastify, vendo o tipo declarado e nenhum corpo, recusa com 400
 * (`FST_ERR_CTP_EMPTY_JSON_BODY`) antes de chegar à rota. A tela mostrava "não foi possível
 * concluir", o servidor respondia em dois milissegundos, e não havia erro nenhum no log de
 * negócio para investigar.
 *
 * O conserto fica num lugar só, no caminho por onde toda chamada passa, porque o mesmo padrão
 * está em vários hooks — e o próximo DELETE escrito herdaria o mesmo defeito.
 */

describe('SEC-01: cabeçalho de tipo em requisição sem corpo', () => {
  it('tira o content-type quando não há corpo', () => {
    const init = semCorpoSemTipo({
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
    });

    expect(new Headers(init.headers).has('content-type')).toBe(false);
  });

  it('não tira nada quando há corpo', () => {
    const init = semCorpoSemTipo({
      method: 'POST',
      body: '{"name":"Follow-up"}',
      headers: { 'content-type': 'application/json' },
    });

    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
  });

  /** Só o tipo sai; autorização e o resto seguem intocados. */
  it('preserva os outros cabeçalhos', () => {
    const init = semCorpoSemTipo({
      method: 'DELETE',
      headers: { 'content-type': 'application/json', 'x-alvo': 'auto-1' },
    });

    expect(new Headers(init.headers).get('x-alvo')).toBe('auto-1');
  });

  it('requisição sem cabeçalho nenhum passa como está', () => {
    expect(semCorpoSemTipo({ method: 'GET' })).toEqual({ method: 'GET' });
  });
});
