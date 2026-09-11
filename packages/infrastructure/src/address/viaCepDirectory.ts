import type { CepAddress, CepDirectory } from '@expedition/application';

/**
 * CL-02 — o diretório de CEP contra o ViaCEP.
 *
 * **A chamada sai daqui, e não do navegador.** A CSP do front não lista `viacep.com.br` em
 * `connect-src`, então a consulta feita na tela vinha sendo bloqueada em silêncio — o `catch`
 * do hook a transformava em "CEP não encontrado — preencha manualmente", que é exatamente o
 * que se vê quando um CEP não existe. E a página de inscrição é pública: chamá-lo de lá daria
 * a um terceiro o IP de todo interessado, a mesma objeção que manteve o captcha fora (SEC-20).
 *
 * Não é o `chamarUrl` da automação (AU-21) e não precisa das guardas dele: o endereço é fixo e
 * o único pedaço variável são oito dígitos já validados pelo caso de uso — não há URL de
 * terceiro para apontar para dentro da rede.
 *
 * O prazo existe porque isto roda **dentro de uma requisição nossa**: o ViaCEP fora do ar não
 * pode virar requisição pendurada, e a tela tem um caminho pronto para a falha (preencher à
 * mão). O cache é de processo e não expira — CEP não muda de rua, e a lista inteira do Brasil
 * não caberia em memória por acidente: só entra o que alguém digitou.
 */

const ENDERECO = 'https://viacep.com.br/ws';
const PRAZO_MS = 4_000;

export function viaCepDirectory(fetchImpl: typeof fetch = fetch): CepDirectory {
  const cache = new Map<string, CepAddress>();

  return {
    async lookup(cep: string): Promise<CepAddress | null> {
      const guardado = cache.get(cep);
      if (guardado) return guardado;

      const corpo = await buscar(fetchImpl, cep);
      const endereco = mapViaCepResponse(corpo);
      if (endereco !== null) cache.set(cep, endereco);
      return endereco;
    },
  };
}

async function buscar(fetchImpl: typeof fetch, cep: string): Promise<unknown> {
  const cancelamento = AbortSignal.timeout(PRAZO_MS);
  try {
    const res = await fetchImpl(`${ENDERECO}/${cep}/json/`, { signal: cancelamento });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    // Rede fora, prazo estourado, corpo que não é JSON: para quem digitou, tudo isto é a mesma
    // coisa — não deu, preencha à mão. Erro de negócio seria prometer uma distinção que a tela
    // não tem o que fazer com.
    return null;
  }
}

/** Exportado para teste: é a única parte que pode estar errada sem nada quebrar. */
export function mapViaCepResponse(corpo: unknown): CepAddress | null {
  if (typeof corpo !== 'object' || corpo === null) return null;
  const dados = corpo as Record<string, unknown>;

  // CEP inexistente responde 200 com `erro`, não 404 — e o valor já veio como booleano e como
  // string em versões diferentes da API.
  if (dados['erro'] === true || dados['erro'] === 'true') return null;

  const city = texto(dados['localidade']);
  if (city === '') return null;

  return {
    street: texto(dados['logradouro']),
    district: texto(dados['bairro']),
    city,
    state: texto(dados['uf']),
  };
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}
