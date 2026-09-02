/**
 * SEC-01 — tira do endereço o que não pode virar linha de log.
 *
 * Duas coisas entram por aí:
 *
 * - **O termo de busca.** A busca de cliente aceita nome, CPF ou telefone em `?q=`, e o log de
 *   acesso do Fastify registra a URL inteira. Agregador de log tem retenção longa e público
 *   mais amplo que o back-office.
 * - **O segredo do webhook no caminho** (AT-02). Ele está ali porque nem todo provedor deixa
 *   configurar cabeçalho — e é justamente por ser uma URL que ele passa por mais lugares.
 *
 * Do log do proxy (Railway) não dá para tirar: aquele registro é de outra casa. Por isso a
 * troca do segredo é barata por desenho — desconectar e conectar gera outro.
 *
 * Função pura, sem I/O: é a fronteira do log, e teste de log não precisa subir servidor.
 */

/** Nomes de parâmetro cujo **valor** nunca é registrado. */
const SENSIVEIS = new Set(['q', 'token', 'apikey', 'secret']);

/** `/v1/webhooks/<provedor>/<slug>/<segredo>` — o quarto segmento é credencial. */
const WEBHOOK_COM_SEGREDO = /^(\/v1\/webhooks\/[^/]+\/[^/]+\/)[^/]+$/;

const CENSURA = '[redacted]';

export function redactUrl(url: string): string {
  const corte = url.indexOf('?');
  const caminho = corte === -1 ? url : url.slice(0, corte);
  const query = corte === -1 ? '' : url.slice(corte + 1);

  return redactPath(caminho) + (query === '' ? '' : `?${redactQuery(query)}`);
}

function redactPath(caminho: string): string {
  const match = WEBHOOK_COM_SEGREDO.exec(caminho);
  return match ? `${match[1]}${CENSURA}` : caminho;
}

/*
 * Percorre os pares à mão em vez de usar `URLSearchParams`: ela reescreve a query inteira ao
 * serializar (ordem, codificação, `+` virando `%20`), e log que não parece com o que chegou
 * atrapalha justamente quando se está depurando.
 */
function redactQuery(query: string): string {
  return query
    .split('&')
    .map((par) => {
      const igual = par.indexOf('=');
      if (igual === -1) return par;
      const nome = par.slice(0, igual);
      return SENSIVEIS.has(nome.toLowerCase()) ? `${nome}=${CENSURA}` : par;
    })
    .join('&');
}
