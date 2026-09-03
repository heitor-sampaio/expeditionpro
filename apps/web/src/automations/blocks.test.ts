import { describe, expect, it } from 'vitest';
import { BLOCOS, CAMPOS, GATILHOS, blockLabel, saidasDe } from './blocks.js';

/**
 * AU-01 — o catálogo de blocos, conferido contra o que a tela precisa dele.
 *
 * O catálogo é dado, e por isso é fácil acrescentar um bloco e esquecer metade: um bloco cuja
 * configuração o inspetor não desenha vira um cartão que **não dá para configurar**, e ninguém
 * descobre até tentar usar. Um bloco com espécie sem saídas declaradas vira cartão que não liga
 * em nada. Nenhum dos dois quebra o build; os dois quebram o editor em silêncio.
 *
 * Estes testes são o portão que fecha esse buraco — eles falham no momento em que alguém
 * acrescenta um bloco pela metade.
 */

const TODOS = [...GATILHOS, ...BLOCOS];

describe('AU-01: o catálogo fecha com o inspetor', () => {
  it('toda chave da configuração inicial tem um campo para editar', () => {
    for (const bloco of TODOS) {
      const campos = (CAMPOS[bloco.type] ?? []).map((c) => c.key);
      expect(Object.keys(bloco.config).sort(), `bloco ${bloco.type}`).toEqual(campos.sort());
    }
  });

  it('todo campo do inspetor nasce na configuração inicial — nada aparece vazio por acidente', () => {
    for (const [tipo, campos] of Object.entries(CAMPOS)) {
      const bloco = TODOS.find((b) => b.type === tipo);
      expect(bloco, `campos de ${tipo} sem bloco no catálogo`).toBeDefined();
      for (const campo of campos) {
        expect(bloco?.config, `${tipo}.${campo.key}`).toHaveProperty(campo.key);
      }
    }
  });

  /** Campo de escolha sem opção é uma caixa vazia: a pessoa não tem o que escolher. */
  it('campo de escolha traz as opções, e o valor inicial é uma delas', () => {
    for (const bloco of TODOS) {
      for (const campo of CAMPOS[bloco.type] ?? []) {
        if (campo.kind !== 'select') continue;
        const valores = (campo.options ?? []).map((o) => o.value);
        expect(valores.length, `${bloco.type}.${campo.key}`).toBeGreaterThan(0);
        expect(valores, `${bloco.type}.${campo.key}`).toContain(bloco.config[campo.key]);
      }
    }
  });
});

describe('AU-01: o catálogo fecha com o quadro', () => {
  it('toda espécie usada tem saídas declaradas', () => {
    for (const bloco of TODOS) {
      expect(saidasDe(bloco.kind, bloco.config), `espécie ${bloco.kind}`).toBeDefined();
    }
  });

  /** Só o fim encerra um caminho. Qualquer outro bloco sem saída deixaria o fluxo sem seguir. */
  it('só o bloco de fim não tem saída', () => {
    for (const bloco of TODOS) {
      const temSaida = saidasDe(bloco.kind, bloco.config).length > 0;
      expect(temSaida, `bloco ${bloco.type}`).toBe(bloco.kind !== 'end');
    }
  });

  /**
   * AU-15 — a escolha múltipla nasce com o padrão e ganha uma saída por valor, com o valor
   * como rótulo. Alça sem rótulo num bloco de cinco saídas é onde se liga o caminho errado.
   */
  it('a escolha múltipla tem uma saída por valor, mais o padrão', () => {
    const saidas = saidasDe('switch', {
      field: 'mensagem.texto',
      cases: [
        { id: 'c1', value: 'preço' },
        { id: 'c2', value: 'data' },
      ],
    });

    expect(saidas).toEqual([
      { port: 'case_c1', label: 'preço' },
      { port: 'case_c2', label: 'data' },
      { port: 'default', label: 'padrão' },
    ]);
  });

  it('escolha múltipla recém-posta no quadro já tem o padrão', () => {
    expect(saidasDe('switch', { field: '', cases: [] })).toEqual([
      { port: 'default', label: 'padrão' },
    ]);
  });

  it('não existem dois blocos com o mesmo tipo', () => {
    const tipos = TODOS.map((b) => b.type);
    expect(new Set(tipos).size).toBe(tipos.length);
  });

  it('todo bloco tem rótulo, e tipo desconhecido devolve o próprio nome', () => {
    for (const bloco of TODOS) expect(blockLabel(bloco.type)).toBe(bloco.label);
    expect(blockLabel('inventado')).toBe('inventado');
  });
});
