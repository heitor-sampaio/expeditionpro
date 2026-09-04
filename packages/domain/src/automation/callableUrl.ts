/**
 * AU-21 — para onde uma automação pode chamar.
 *
 * O bloco de chamar URL é a porta mais perigosa que este sistema já teve: quem desenha a
 * automação passa a mandar **o servidor** bater onde quiser, com a rede que o servidor tem. E o
 * alvo interessante não é a internet — é o que só o servidor alcança: o metadado da nuvem em
 * `169.254.169.254`, o banco em `10.x`, a própria API em `localhost`, que confiaria na chamada
 * por vir de dentro.
 *
 * Daí as três regras, todas aqui e nenhuma no desenho: **https obrigatório** (o corpo leva dado
 * de cliente), **sem credencial na URL** (vaza em log de proxy) e **nada que aponte para
 * dentro**. Quem resolve o DNS pergunta de novo, com os endereços na mão: um host público pode
 * apontar para IP interno, e é assim que se contorna uma checagem só de nome.
 *
 * Função pura: julgar endereço não precisa de rede.
 */

export class InvalidCallableUrlError extends Error {
  readonly code = 'invalid_callable_url';

  constructor(readonly reason: string) {
    super(`endereço recusado: ${reason}`);
    this.name = 'InvalidCallableUrlError';
  }
}

/** Nomes que só existem dentro. `localhost` é o caso óbvio; os outros são os menos óbvios. */
const NOMES_DE_DENTRO = /^(localhost|.*\.local|.*\.internal|.*\.localdomain)$/i;

/**
 * O endereço julgado, em partes. É um tipo próprio, e não o `URL` do runtime, porque o domínio
 * não conhece plataforma: o mesmo arquivo compila para o servidor e para o navegador.
 */
export interface CallableUrl {
  readonly href: string;
  readonly hostname: string;
  readonly port: string;
  readonly pathname: string;
}

const FORMA =
  /^(?<esquema>[a-z][a-z0-9+.-]*):\/\/(?:(?<cred>[^@/]*)@)?(?<host>\[[^\]]+\]|[^/:?#]+)(?::(?<porta>\d+))?(?<caminho>[/?#]\S*)?$/i;

export function parseCallableUrl(bruto: string, resolvidos: readonly string[] = []): CallableUrl {
  const partes = FORMA.exec(bruto.trim())?.groups;
  if (partes === undefined) throw new InvalidCallableUrlError('não é um endereço');

  if ((partes['esquema'] ?? '').toLowerCase() !== 'https') {
    throw new InvalidCallableUrlError('só https');
  }
  if ((partes['cred'] ?? '') !== '') {
    throw new InvalidCallableUrlError('sem usuário e senha no endereço');
  }

  const host = semColchetes((partes['host'] ?? '').toLowerCase());
  if (host === '') throw new InvalidCallableUrlError('não é um endereço');
  if (NOMES_DE_DENTRO.test(host) || ehDeDentro(host)) {
    throw new InvalidCallableUrlError('aponta para dentro');
  }

  // Um endereço interno na lista já basta: o cliente HTTP pode escolher qualquer um deles.
  if (resolvidos.some((ip) => ehDeDentro(semColchetes(ip.toLowerCase())))) {
    throw new InvalidCallableUrlError('aponta para dentro');
  }

  const caminho = partes['caminho'] ?? '/';
  return {
    href: bruto.trim(),
    hostname: host,
    port: partes['porta'] ?? '',
    pathname: caminho.split(/[?#]/)[0] || '/',
  };
}

/** `[::1]` chega assim de `URL.hostname`; comparar sem os colchetes é o que funciona nos dois. */
function semColchetes(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

/**
 * O endereço é da rede de dentro?
 *
 * Só decide sobre o que **é** endereço: nome de domínio devolve `false` aqui, e quem cuida dele
 * é a lista de nomes acima, mais a checagem de novo depois do DNS.
 */
function ehDeDentro(host: string): boolean {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    // 169.254 é o metadado da nuvem — o alvo mais visado deste tipo de furo.
    if (a === 169 && b === 254) return true;
    // 100.64/10 é a rede compartilhada de operadora, e costuma ser interna nas nuvens.
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }

  const v6 = host.toLowerCase();
  if (!v6.includes(':')) return false;
  if (v6 === '::1' || v6 === '::') return true;
  // fc00::/7 é o ULA (rede privada v6); fe80::/10 é link-local.
  if (/^f[cd]/.test(v6) || /^fe[89ab]/.test(v6)) return true;
  // `::ffff:10.0.0.1` embute um v4: o julgamento é o do v4 embutido.
  const embutido = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(v6);
  return embutido ? ehDeDentro(embutido[1]!) : false;
}
