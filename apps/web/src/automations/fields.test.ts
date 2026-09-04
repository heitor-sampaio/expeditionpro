import { describe, expect, it } from 'vitest';
import {
  caminhosDe,
  camposDisponiveis,
  gatilhoDoQuadro,
  variaveisDeCampos,
  variaveisDoFluxo,
} from './fields.js';

/**
 * AU-16 — o seletor de campos.
 *
 * O problema que ele resolve é de quem desenha: hoje é preciso saber de cor que existe
 * `contato.nome` e que não existe `contato.fone`. Errar não dá erro nenhum — a variável
 * ausente vira vazio (AU-09), a mensagem sai sem o nome e ninguém descobre.
 *
 * A lista tem duas origens: o que o gatilho põe no contexto (catálogo do domínio) e o que o
 * próprio fluxo definiu em blocos de variável, que só o quadro conhece.
 */

const quadro = [
  { data: { type: 'message_received', config: {} }, type: 'trigger' },
  { data: { type: 'set', config: { name: 'saudacao', value: 'Bom dia' } }, type: 'setVariable' },
  { data: { type: 'send_message', config: { text: 'oi' } }, type: 'action' },
];

describe('AU-16: as variáveis que o próprio fluxo define', () => {
  it('o nome do bloco de variável entra na lista', () => {
    expect(variaveisDoFluxo(quadro).map((c) => c.path)).toEqual(['saudacao']);
  });

  it('variável sem nome não entra — não há o que oferecer', () => {
    const semNome = [{ data: { type: 'set', config: { name: '  ' } }, type: 'setVariable' }];
    expect(variaveisDoFluxo(semNome)).toEqual([]);
  });

  it('o mesmo nome definido duas vezes aparece uma vez só', () => {
    const duas = [
      { data: { type: 'set', config: { name: 'saudacao' } }, type: 'setVariable' },
      { data: { type: 'set', config: { name: 'saudacao' } }, type: 'setVariable' },
    ];
    expect(variaveisDoFluxo(duas)).toHaveLength(1);
  });
});

describe('AU-16: o gatilho que está no quadro', () => {
  it('devolve o tipo do bloco de gatilho', () => {
    expect(gatilhoDoQuadro(quadro)).toBe('message_received');
  });

  it('quadro sem gatilho devolve nulo', () => {
    expect(gatilhoDoQuadro([{ data: { type: 'end', config: {} }, type: 'end' }])).toBeNull();
  });

  /** Gatilho que este editor não conhece não vira promessa de campo nenhum. */
  it('gatilho de tipo desconhecido devolve nulo', () => {
    const estranho = [{ data: { type: 'quando_der', config: {} }, type: 'trigger' }];
    expect(gatilhoDoQuadro(estranho)).toBeNull();
  });
});

describe('AU-16: a lista que o seletor oferece', () => {
  it('junta os campos do gatilho com as variáveis do fluxo', () => {
    const caminhos = camposDisponiveis(quadro).map((c) => c.path);

    expect(caminhos).toContain('contato.nome');
    expect(caminhos).toContain('mensagem.texto');
    expect(caminhos).toContain('saudacao');
  });

  /** Sem gatilho no quadro, o contexto é desconhecido: só o que o fluxo mesmo definiu. */
  it('sem gatilho, oferece apenas as variáveis do fluxo', () => {
    const semGatilho = [
      { data: { type: 'set', config: { name: 'saudacao' } }, type: 'setVariable' },
    ];
    expect(camposDisponiveis(semGatilho).map((c) => c.path)).toEqual(['saudacao']);
  });

  it('não repete caminho', () => {
    const caminhos = camposDisponiveis(quadro).map((c) => c.path);
    expect(new Set(caminhos).size).toBe(caminhos.length);
  });
});

/**
 * AU-18 · AU-16 — os campos que a busca acrescenta.
 *
 * Num fluxo que começa no relógio, o gatilho não traz contato nenhum: quem traz é a busca. Sem
 * isto, o seletor ficaria vazio justamente no fluxo em que ele é mais necessário — e a pessoa
 * escreveria `{{contato.nome}}` de memória, que é o que AU-16 existe para acabar.
 */
describe('AU-18: os campos vindos da busca', () => {
  const comBusca = [
    { data: { type: 'recurring', config: {} }, type: 'trigger' },
    { data: { type: 'find_one', config: { entity: 'opportunities' } }, type: 'lookup' },
    { data: { type: 'send_message', config: { text: '' } }, type: 'action' },
  ];

  it('a busca põe os campos da entidade escolhida na lista do seletor', () => {
    const caminhos = camposDisponiveis(comBusca).map((c) => c.path);

    expect(caminhos).toContain('oportunidade.etapa');
    expect(caminhos).toContain('oportunidade.paradaHaMin');
  });

  /** Trocar a entidade troca os campos: é a mesma lista que o filtro do bloco oferece. */
  it('percorrer conversas oferece os campos da conversa', () => {
    const emConversas = [
      { data: { type: 'recurring', config: {} }, type: 'trigger' },
      { data: { type: 'find_one', config: { entity: 'conversations' } }, type: 'lookup' },
    ];

    const caminhos = camposDisponiveis(emConversas).map((c) => c.path);
    expect(caminhos).toContain('conversa.quemDeve');
    expect(caminhos).toContain('conversa.paradaHaMin');
  });

  it('sem busca no quadro, o gatilho de tempo só oferece o relógio', () => {
    const semBusca = [{ data: { type: 'recurring', config: {} }, type: 'trigger' }];

    expect(camposDisponiveis(semBusca).map((c) => c.path)).toEqual(['agora.data', 'agora.hora']);
  });

  it('não repete caminho quando gatilho e busca oferecem o mesmo', () => {
    const caminhos = camposDisponiveis(comBusca).map((c) => c.path);
    expect(new Set(caminhos).size).toBe(caminhos.length);
  });
});

/**
 * AU-19 — o que a busca traz entra na lista do "Se".
 *
 * É o pedido inteiro numa frase: "preciso que o Se tenha os campos que dá para obter com um
 * get". Com o bloco de buscar no quadro, os campos da entidade que ele procura passam a ser
 * oferecidos — e a condição pode perguntar por eles.
 */
describe('AU-19: os campos que o bloco de buscar traz', () => {
  const comBuscarUm = [
    { data: { type: 'message_received', config: {} }, type: 'trigger' },
    { data: { type: 'find_one', config: { entity: 'opportunities' } }, type: 'lookup' },
    { data: { type: 'field', config: {} }, type: 'condition' },
  ];

  it('o "Se" passa a enxergar os campos da entidade buscada', () => {
    const caminhos = camposDisponiveis(comBuscarUm).map((c) => c.path);

    expect(caminhos).toContain('oportunidade.id');
    expect(caminhos).toContain('oportunidade.etapa');
  });

  /** E o que o gatilho já trazia continua lá: a busca soma, não substitui. */
  it('os campos do gatilho continuam na lista', () => {
    const caminhos = camposDisponiveis(comBuscarUm).map((c) => c.path);

    expect(caminhos).toContain('mensagem.texto');
    expect(caminhos).toContain('contato.nome');
  });
});

describe('AU-25: os dados do ensaio, montados dos campos', () => {
  it('transforma caminho em objeto aninhado, que é a forma que o motor lê', () => {
    expect(variaveisDeCampos({ 'contato.nome': 'Ana', 'mensagem.texto': 'quanto custa?' })).toEqual(
      { contato: { nome: 'Ana' }, mensagem: { texto: 'quanto custa?' } },
    );
  });

  it('junta campos do mesmo ramo em vez de sobrescrever', () => {
    expect(variaveisDeCampos({ 'contato.nome': 'Ana', 'contato.telefone': '48999998877' })).toEqual(
      {
        contato: { nome: 'Ana', telefone: '48999998877' },
      },
    );
  });

  it('deixa de fora o que ficou em branco — campo vazio é campo que o gatilho não traria', () => {
    expect(variaveisDeCampos({ 'contato.nome': '', 'contato.telefone': '  ' })).toEqual({});
  });

  it('caminho sem ponto vira chave de primeiro nível', () => {
    expect(variaveisDeCampos({ agora: '2026-09-04' })).toEqual({ agora: '2026-09-04' });
  });
});

describe('AU-27: o contexto virando lista de caminhos', () => {
  it('achata objeto aninhado no caminho que o marcador usa', () => {
    expect(caminhosDe({ contato: { nome: 'Ana', telefone: '48999998877' } })).toEqual([
      { path: 'contato.nome', valor: 'Ana' },
      { path: 'contato.telefone', valor: '48999998877' },
    ]);
  });

  it('mantém o valor de primeiro nível', () => {
    expect(caminhosDe({ saudacao: 'Oi' })).toEqual([{ path: 'saudacao', valor: 'Oi' }]);
  });

  it('número e booleano viram texto, porque é assim que entram na mensagem', () => {
    expect(caminhosDe({ total: 3, pago: true })).toEqual([
      { path: 'total', valor: '3' },
      { path: 'pago', valor: 'true' },
    ]);
  });

  it('lista não vira caminho por item: mostra o tamanho, que é o que se usa', () => {
    expect(caminhosDe({ achados: [{ a: 1 }, { a: 2 }] })).toEqual([
      { path: 'achados', valor: '2 itens' },
    ]);
  });

  it('nulo e vazio aparecem, porque campo vazio é justamente o que se quer ver', () => {
    expect(caminhosDe({ contato: { nome: null } })).toEqual([{ path: 'contato.nome', valor: '' }]);
  });

  it('para de descer no fundo, para um contexto torto não travar a tela', () => {
    const fundo = { a: { b: { c: { d: { e: 'longe' } } } } };
    expect(caminhosDe(fundo).map((c) => c.path)).toEqual(['a.b.c.d']);
  });
});
