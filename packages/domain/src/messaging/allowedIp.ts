/**
 * AT-02 — a origem como autenticação do webhook.
 *
 * Existe porque nem toda instalação da Evolution deixa configurar alguma coisa na chamada: nem
 * cabeçalho, nem corpo. Sobra quem está do outro lado da conexão.
 *
 * Não é um segredo, é uma **cerca**: só o servidor da instância entra. Mais fraca que um
 * segredo em dois sentidos — quem estiver no mesmo IP passa, e trocar de servidor exige mexer
 * aqui — e mais forte em um: não existe valor nenhum para vazar em URL, log ou print de tela.
 *
 * Funções puras, sem I/O: comparar endereço não precisa de rede.
 */

/** IPv4 em quatro octetos de 0 a 255. Sem faixa, sem máscara: um endereço por vez. */
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
/** IPv6 no bastante para conferir que é endereço, não domínio digitado por engano. */
const IPV6 = /^[0-9a-f:]+$/i;

/** `::ffff:1.2.3.4` e `1.2.3.4` são o mesmo endereço — atrás de proxy os dois aparecem. */
function normalizar(ip: string): string {
  const limpo = ip.trim().toLowerCase();
  return limpo.startsWith('::ffff:') ? limpo.slice('::ffff:'.length) : limpo;
}

/**
 * Lista vazia **não libera ninguém**: cerca desligada é cerca desligada, nunca "todo mundo
 * entra". O padrão de quem esqueceu de configurar tem que ser o fechado.
 */
export function ipIsAllowed(ip: string, allowed: readonly string[]): boolean {
  const alvo = normalizar(ip);
  if (alvo === '') return false;
  return allowed.some((permitido) => normalizar(permitido) === alvo);
}

/**
 * Lê o campo da tela: endereços separados por vírgula, espaço ou quebra de linha.
 *
 * Recusa o que não é endereço em vez de guardar texto solto — um IP digitado errado vira uma
 * cerca que nunca deixa ninguém passar, e o sintoma só aparece quando a mensagem não chega.
 */
export function parseAllowedIps(texto: string): string[] {
  const partes = texto
    .split(/[\s,]+/)
    .map((parte) => parte.trim())
    .filter((parte) => parte !== '');

  const invalido = partes.find((parte) => !isIp(parte));
  if (invalido !== undefined) {
    throw new InvalidIpError(invalido);
  }
  return [...new Set(partes)];
}

export class InvalidIpError extends Error {
  readonly code = 'invalid_ip';
  readonly value: string;
  constructor(value: string) {
    super(`Não é um endereço IP: ${value}`);
    this.value = value;
  }
}

function isIp(valor: string): boolean {
  const v4 = IPV4.exec(valor);
  if (v4) return v4.slice(1).every((octeto) => Number(octeto) <= 255);
  return valor.includes(':') && IPV6.test(valor);
}
