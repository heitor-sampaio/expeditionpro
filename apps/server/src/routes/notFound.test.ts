import { describe, expect, it } from 'vitest';
import { buildServer } from '../buildServer.js';

/**
 * SEC — rota inexistente responde no formato do sistema, e não conta o que não sabe.
 *
 * Sem `setNotFoundHandler`, o 404 vinha do handler padrão do Fastify, com um corpo de
 * outro formato: `{"message":"Route GET:/ not found","error":"Not Found","statusCode":404}`.
 * Três problemas, todos pequenos e todos reais:
 *
 * - **Vaza o método e o caminho de volta.** É eco de entrada do usuário no corpo da
 *   resposta — inofensivo em JSON, mas é o hábito errado num sistema onde o handler de erro
 *   foi escrito justamente para nunca devolver o que recebeu.
 * - **Formato diferente do resto.** Todo erro daqui é `{ error: <código estável> }`; o
 *   cliente que trata erro tem que conhecer dois formatos.
 * - **Confirma o servidor.** `"Route GET:/ not found"` identifica Fastify de graça.
 *
 * O caso real: o dono abriu o domínio da API no navegador esperando o sistema e recebeu
 * essa mensagem, que não diz nada sobre onde o sistema está.
 */
describe('SEC: rota inexistente', () => {
  it('responde 404 no mesmo formato dos outros erros', async () => {
    const app = await buildServer({ logger: false });

    const res = await app.inject({ method: 'GET', url: '/nao-existe' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
    await app.close();
  });

  it('não devolve o caminho pedido nem o nome do servidor', async () => {
    const app = await buildServer({ logger: false });

    const res = await app.inject({ method: 'GET', url: '/segredo-que-alguem-chutou' });

    expect(res.body).not.toContain('segredo-que-alguem-chutou');
    expect(res.body).not.toContain('Route');
    await app.close();
  });

  it('vale para qualquer método, não só GET', async () => {
    const app = await buildServer({ logger: false });

    const res = await app.inject({ method: 'POST', url: '/v1/rota-que-nao-existe' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
    await app.close();
  });

  it('o health check continua respondendo — o handler não engole rota válida', async () => {
    const app = await buildServer({ logger: false });

    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    await app.close();
  });
});
