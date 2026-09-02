import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * SEC-01 — Content-Security-Policy no front.
 *
 * A CSP do helmet só cobre as respostas JSON da API, onde ela é praticamente inócua: quem
 * renderiza HTML é este front, e ele não tinha CSP nenhuma. É defesa em profundidade — o
 * XSS armazenado do termo aceito já foi fechado na origem (escape das variáveis), mas uma
 * segunda linha existe justamente para o furo que ninguém viu.
 *
 * As origens vêm do ambiente porque mudam por instalação: o Supabase de cada projeto e,
 * desde o SEC-16, a API. Em dev ela é `'self'` (proxy do Vite); publicada como serviço
 * separado no Railway, é outro host, e sem ele em `connect-src` o navegador bloqueia
 * **toda** chamada — com a tela em branco e o erro só no console.
 *
 * `style-src` precisa de `'unsafe-inline'`: React escreve `style=` inline em vários pontos
 * (barra de meta segmentada, larguras percentuais), e o Google Fonts injeta CSS. Sem isso a
 * tela quebra. `script-src` fica sem — que é onde `unsafe-inline` de fato importa.
 */
function cspPlugin(supabaseUrl: string, apiUrl: string): Plugin {
  const supabase = supabaseUrl || 'https://*.supabase.co';
  const wsSupabase = supabase.replace(/^https/, 'wss');
  // Vazio quando a API está na mesma origem: `'self'` já a cobre.
  const api = apiUrl ? ` ${apiUrl.replace(/\/+$/, '')}` : '';
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    'font-src https://fonts.gstatic.com',
    // Imagem do Storage vem por URL assinada do Supabase; `blob:` é o preview do upload.
    `img-src 'self' data: blob: ${supabase}`,
    /*
     * AT-13 — vídeo e áudio das conversas, também por URL assinada.
     *
     * Sem esta linha eles cairiam em `default-src 'self'` e o navegador bloquearia, sem erro
     * visível na tela: o player simplesmente não toca. Imagem já estava coberta, e foi o que
     * quase escondeu o problema.
     */
    `media-src 'self' blob: ${supabase}`,
    `connect-src 'self'${api} ${supabase} ${wsSupabase}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  return {
    name: 'expedition-csp',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      );
    },
  };
}

// Capacitor empacota este front apontando server.url para o Railway (§2.1).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), cspPlugin(env['VITE_SUPABASE_URL'] ?? '', env['VITE_API_URL'] ?? '')],
    server: {
      port: 5173,
      // Proxy da API em dev: o front chama /v1/... na mesma origem e o Vite encaminha
      // para o Fastify. Evita CORS no desenvolvimento — e é por isso que `VITE_API_URL`
      // fica vazia localmente.
      proxy: { '/v1': 'http://localhost:3000' },
    },
    build: { outDir: 'dist', sourcemap: true },
  };
});
