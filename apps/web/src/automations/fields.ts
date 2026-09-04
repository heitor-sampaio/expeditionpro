import {
  CAMPOS_DO_GATILHO,
  contextFieldsFor,
  entityFieldsOf,
  TRIGGER_TYPES,
} from '@expedition/domain';
import type { ContextField, TriggerType } from '@expedition/domain';

/**
 * AU-16 — os campos que o seletor oferece.
 *
 * Sem isto, desenhar uma automação é lembrar de cor que existe `contato.nome` e que não existe
 * `contato.fone`. Errar não dá erro: a variável ausente vira vazio (AU-09, e é a regra certa),
 * a mensagem sai sem o nome do cliente e ninguém descobre.
 *
 * A lista vem de dois lugares. O que o gatilho põe no contexto é contrato, e mora no domínio
 * — a mesma lista que o teste da borda cobra. O que o fluxo define em bloco de variável só o
 * quadro conhece, e por isso é lido daqui, do desenho aberto na tela.
 */

/** O bloco como o quadro o guarda. Só o que interessa para achar campo. */
export interface BlocoNoQuadro {
  readonly type?: string | undefined;
  readonly data: { readonly type: string; readonly config: Record<string, unknown> };
}

/** O gatilho posto no quadro, ou `null` — inclusive quando o tipo não é um que se conhece. */
export function gatilhoDoQuadro(nodes: readonly BlocoNoQuadro[]): TriggerType | null {
  const gatilho = nodes.find((no) => no.type === 'trigger');
  if (gatilho === undefined) return null;
  const tipo = gatilho.data.type as TriggerType;
  return TRIGGER_TYPES.includes(tipo) ? tipo : null;
}

/**
 * As variáveis que o próprio fluxo define. O rótulo diz de onde vieram: numa lista com
 * `contato.nome` e `saudacao` lado a lado, saber qual é do gatilho e qual é do desenho é o que
 * evita procurar no lugar errado quando o valor vem vazio.
 */
export function variaveisDoFluxo(nodes: readonly BlocoNoQuadro[]): ContextField[] {
  const nomes = new Set<string>();
  for (const no of nodes) {
    if (no.data.type !== 'set') continue;
    const nome = String(no.data.config['name'] ?? '').trim();
    if (nome !== '') nomes.add(nome);
  }
  return [...nomes].map((nome) => ({ path: nome, label: 'Definida no fluxo' }));
}

/**
 * Tudo que se pode usar neste desenho: o contexto do gatilho, o que a busca traz, e o que o
 * fluxo criou pelo caminho.
 *
 * AU-18: a busca é a única fonte de contato num fluxo que começa no relógio — sem ela na
 * lista, o seletor ficaria vazio justamente onde é mais necessário.
 */
export function camposDisponiveis(nodes: readonly BlocoNoQuadro[]): ContextField[] {
  // AU-18 · AU-19: as duas buscas trazem campos — a que semeia e a que traz um item para o
  // contexto. Sem elas na lista, o "Se" não teria como perguntar pelo que o gatilho não trouxe.
  // AU-19 · AU-20: quem traz campos é a busca — o "para cada" só percorre o que ela guardou.
  const daBusca = nodes
    .filter((no) => no.type === 'lookup')
    .flatMap((no) => entityFieldsOf(no.data.config));

  const todos = [
    ...contextFieldsFor(gatilhoDoQuadro(nodes)),
    ...daBusca,
    ...variaveisDoFluxo(nodes),
  ];
  const vistos = new Set<string>();
  return todos.filter((campo) => !vistos.has(campo.path) && vistos.add(campo.path) !== undefined);
}

/** Os campos de cada gatilho, para a biblioteca dizer o que ele traz antes de ser escolhido. */
export function camposDoGatilho(trigger: TriggerType): readonly ContextField[] {
  return CAMPOS_DO_GATILHO[trigger];
}

/**
 * AU-25 — os campos do ensaio viram o contexto que o gatilho traria.
 *
 * A tela pergunta um campo por caminho (`contato.nome`), porque é assim que quem desenha o
 * fluxo pensa; o motor lê objeto aninhado. Esta é a tradução, e ela mora aqui, testada, em vez
 * de dentro do componente — montar objeto por caminho é justamente o tipo de coisa que erra
 * em silêncio.
 *
 * Campo em branco fica de fora: no ensaio isso quer dizer "o gatilho não traria este dado", e
 * é o caso que se quer poder testar.
 */
export function variaveisDeCampos(valores: Record<string, string>): Record<string, unknown> {
  const saida: Record<string, unknown> = {};

  for (const [caminho, valor] of Object.entries(valores)) {
    if (valor.trim() === '') continue;

    const partes = caminho.split('.');
    const folha = partes.pop();
    if (folha === undefined) continue;

    let atual = saida;
    for (const parte of partes) {
      const filho = atual[parte];
      if (filho === undefined || filho === null || typeof filho !== 'object') atual[parte] = {};
      atual = atual[parte] as Record<string, unknown>;
    }
    atual[folha] = valor;
  }

  return saida;
}

/** AU-27 — um campo do contexto, com o valor que ele tem agora. */
export interface CaminhoComValor {
  readonly path: string;
  readonly valor: string;
}

/** Quatro níveis chegam em `oportunidade.contato.endereco.cidade`; mais que isso é contexto
 * torto, e descer sem fim numa tela é como se trava o navegador. */
const FUNDO = 4;

/**
 * AU-27 — o contexto de uma execução virando a lista de caminhos que a tela mostra.
 *
 * É o painel de entrada do bloco: `contato.nome` de um lado, "Ana" do outro. O caminho é
 * escrito na forma que o marcador usa, porque clicar nele **insere o marcador** — a lista não
 * é só informação, é de onde a variável sai.
 *
 * Lista não vira um caminho por item de propósito. Numa busca com trinta achados, trinta
 * ramos afogariam os campos que interessam; o que se usa de uma lista é o tamanho e o bloco
 * "para cada".
 */
export function caminhosDe(dados: Record<string, unknown>, prefixo = ''): CaminhoComValor[] {
  const saida: CaminhoComValor[] = [];

  for (const [chave, valor] of Object.entries(dados)) {
    const path = prefixo === '' ? chave : `${prefixo}.${chave}`;

    if (Array.isArray(valor)) {
      saida.push({
        path,
        valor: `${String(valor.length)} ${valor.length === 1 ? 'item' : 'itens'}`,
      });
      continue;
    }
    if (valor !== null && typeof valor === 'object' && path.split('.').length < FUNDO) {
      saida.push(...caminhosDe(valor as Record<string, unknown>, path));
      continue;
    }
    saida.push({ path, valor: texto(valor) });
  }

  return saida;
}

function texto(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}
