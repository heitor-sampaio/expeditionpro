import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Capacitor empacota este front apontando server.url para o Railway (§2.1).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy da API em dev: o front chama /v1/... na mesma origem e o Vite encaminha
    // para o Fastify. Evita CORS no desenvolvimento.
    proxy: { '/v1': 'http://localhost:3000' },
  },
  build: { outDir: 'dist', sourcemap: true },
});
