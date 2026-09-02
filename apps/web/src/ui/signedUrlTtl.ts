/**
 * SEC — validade da URL assinada de Storage, em segundos.
 *
 * Era 3600 (uma hora), escrito à mão em dois lugares, sob um comentário que dizia "curta
 * validade". URL assinada é uma **credencial portátil**: quem a tiver abre a foto do bucket
 * privado sem sessão, sem tenant, sem nada. E ela vaza pelos caminhos de sempre — histórico
 * do navegador, `Referer`, log de proxy corporativo, print de tela com a barra de endereço.
 *
 * Aqui ela só precisa durar o tempo de a imagem carregar: o `src` é resolvido na montagem do
 * componente e o navegador guarda o que já baixou. Cinco minutos é folgado para isso e corta
 * a janela de exposição em doze vezes.
 *
 * Mora num módulo só seu porque uma constante não deve arrastar o cliente do Supabase junto
 * — era o que impedia o teste de carregá-la.
 */
export const SIGNED_URL_TTL_SECONDS = 300;
