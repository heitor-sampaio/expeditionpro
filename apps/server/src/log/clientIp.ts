/**
 * AT-02 · SEC — de quem é a conexão, atrás de um proxy.
 *
 * O servidor roda com `trustProxy` ligado, e nesse modo o `request.ip` do Fastify devolve o
 * **primeiro** endereço do `x-forwarded-for`. Esse cabeçalho é texto que o cliente manda: para
 * uma cerca por origem isso é fatal — bastaria enviar `x-forwarded-for: <ip permitido>` e o
 * servidor concordaria.
 *
 * O endereço confiável é o **último** da lista: é o que o proxy da Railway acrescenta ao ver a
 * conexão de verdade. O que vem antes foi escrito por quem chamou.
 *
 * Quem decide acesso usa esta função. Quem só registra (log, rate limit) pode seguir com o
 * `request.ip` — errar ali custa um balde de limite, não uma porta aberta.
 */
export function clientIp(
  forwardedFor: string | string[] | undefined,
  socketIp: string | undefined,
): string {
  const entradas = (Array.isArray(forwardedFor) ? forwardedFor.join(',') : (forwardedFor ?? ''))
    .split(',')
    .map((entrada) => entrada.trim())
    .filter((entrada) => entrada !== '');

  return entradas.at(-1) ?? socketIp ?? '';
}
