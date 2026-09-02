import { describe, expect, it } from 'vitest';
import { NotFoundError } from '@expedition/application';
import { tenantClient } from './tenantClient.js';
import type { PrismaClient } from './client.js';

/**
 * SEC-02 — escopo de tenant com **chave única composta**.
 *
 * Bug encontrado em produção ao conectar o canal de mensagem (§5.17): `upsert` com
 * `where: { tenantId_channel: { … } }` respondia 500. A extension resolvia a posse com um
 * `findFirst`, e `findFirst` **não aceita** o nome da chave composta — ele só existe em
 * `where` de operação única (`findUnique`, `update`, `delete`, `upsert`). O Prisma recusava a
 * consulta antes de tocar no banco.
 *
 * Passou por todos os portões porque nenhum deles olha para a **forma** do argumento: o fake
 * da aplicação aceita qualquer objeto, e o teste de RLS fala SQL, não Prisma. Este teste fecha
 * essa fresta sem banco nenhum — troca o client por dublês que registram o que receberam, e
 * cobra o contrato: **a consulta de posse tem que ser uma operação que aceite o `where` do
 * chamador**, e um registro de outro tenant tem que continuar invisível.
 *
 * Roda pelo caminho do proxy de transação (`tenantClient` com um client sem `$extends`), que
 * compartilha `scopeOperation` com a extension — é o mesmo código dos dois lados.
 */

const T = '11111111-1111-1111-1111-111111111111';
const OUTRO = 'aaaaaaaa-1111-1111-1111-111111111111';
const CHAVE = { tenantId_channel: { tenantId: T, channel: 'whatsapp' } };

type Chamada = { operacao: string; args: Record<string, unknown> };

function clientFalso(linha: { id: string; tenantId: string } | null) {
  const chamadas: Chamada[] = [];
  const registrar =
    (operacao: string, retorno: unknown) =>
    (args: Record<string, unknown> = {}) => {
      chamadas.push({ operacao, args });
      return Promise.resolve(retorno);
    };

  const delegate = {
    // `findFirst` devolve `null` de propósito: se a resolução de posse continuar passando por
    // ele, o teste falha por caminho errado em vez de por acidente.
    findFirst: registrar('findFirst', null),
    findUnique: registrar('findUnique', linha),
    update: registrar('update', { id: linha?.id ?? 'novo' }),
    create: registrar('create', { id: 'novo' }),
    delete: registrar('delete', { id: linha?.id ?? 'novo' }),
    // Presente porque o delegate real tem: o proxy só intercepta operação que existe. Se
    // aparecer nas chamadas, o escopo foi contornado e passou cru — é isso que se cobra.
    upsert: registrar('upsert-cru', null),
  };
  return { client: { channelIntegration: delegate } as unknown as PrismaClient, chamadas };
}

const dadosDaConexao = {
  channel: 'whatsapp',
  provider: 'evolution',
  baseUrl: 'https://evo.local',
  externalAccountId: 'drakkar',
  accessToken: 'chave',
  webhookTokenHash: 'hash',
};

describe('SEC-02: chave única composta no escopo de tenant', () => {
  it('upsert resolve a posse por uma operação que aceita a chave composta', async () => {
    const { client, chamadas } = clientFalso({ id: 'ch-1', tenantId: T });

    await tenantClient(client, T).channelIntegration.upsert({
      where: CHAVE,
      create: { tenantId: T, ...dadosDaConexao },
      update: { baseUrl: 'https://novo' },
    });

    const posse = chamadas[0]!;
    expect(posse.operacao).toBe('findUnique');
    expect(posse.args['where']).toEqual(CHAVE);
  });

  it('achou e é deste tenant: vira update por id', async () => {
    const { client, chamadas } = clientFalso({ id: 'ch-1', tenantId: T });

    await tenantClient(client, T).channelIntegration.upsert({
      where: CHAVE,
      create: { tenantId: T, ...dadosDaConexao },
      update: { baseUrl: 'https://novo' },
    });

    const escrita = chamadas.at(-1)!;
    expect(escrita.operacao).toBe('update');
    expect(escrita.args['where']).toEqual({ id: 'ch-1' });
  });

  it('não existe: vira create escopado neste tenant', async () => {
    const { client, chamadas } = clientFalso(null);

    await tenantClient(client, T).channelIntegration.upsert({
      where: CHAVE,
      create: { tenantId: T, ...dadosDaConexao },
      update: { baseUrl: 'https://novo' },
    });

    const escrita = chamadas.at(-1)!;
    expect(escrita.operacao).toBe('create');
    expect(escrita.args['data']).toMatchObject({ tenantId: T, channel: 'whatsapp' });
  });

  /**
   * O ponto de segurança: a chave composta é única **no banco inteiro**, não dentro do tenant.
   * Resolver a posse por ela e escrever sem conferir de quem é a linha seria escrever na linha
   * do vizinho — exatamente o furo que a extension existe para impedir.
   */
  it('a linha é de outro tenant: trata como inexistente e cria a própria', async () => {
    const { client, chamadas } = clientFalso({ id: 'ch-do-vizinho', tenantId: OUTRO });

    await tenantClient(client, T).channelIntegration.upsert({
      where: CHAVE,
      create: { tenantId: T, ...dadosDaConexao },
      update: { baseUrl: 'https://novo' },
    });

    expect(chamadas.some((c) => c.operacao === 'update')).toBe(false);
    const escrita = chamadas.at(-1)!;
    expect(escrita.operacao).toBe('create');
    expect(escrita.args['data']).toMatchObject({ tenantId: T });
  });

  it('update por chave composta age por id, e só na linha do tenant', async () => {
    const { client, chamadas } = clientFalso({ id: 'ch-1', tenantId: T });

    await tenantClient(client, T).channelIntegration.update({
      where: CHAVE,
      data: { active: false },
    });

    expect(chamadas[0]!.operacao).toBe('findUnique');
    expect(chamadas.at(-1)!.args['where']).toEqual({ id: 'ch-1' });
  });

  it('update em linha de outro tenant responde como se não existisse', async () => {
    const { client } = clientFalso({ id: 'ch-do-vizinho', tenantId: OUTRO });

    await expect(
      tenantClient(client, T).channelIntegration.update({
        where: CHAVE,
        data: { active: false },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('delete em linha de outro tenant responde como se não existisse', async () => {
    const { client } = clientFalso({ id: 'ch-do-vizinho', tenantId: OUTRO });

    await expect(
      tenantClient(client, T).channelIntegration.delete({ where: CHAVE }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('findUnique por chave composta devolve a linha do tenant', async () => {
    const { client, chamadas } = clientFalso({ id: 'ch-1', tenantId: T });

    const achado = await tenantClient(client, T).channelIntegration.findUnique({ where: CHAVE });

    expect(achado).toMatchObject({ id: 'ch-1' });
    expect(chamadas.every((c) => c.operacao === 'findUnique')).toBe(true);
  });

  it('findUnique não devolve linha de outro tenant', async () => {
    const { client } = clientFalso({ id: 'ch-do-vizinho', tenantId: OUTRO });

    expect(
      await tenantClient(client, T).channelIntegration.findUnique({ where: CHAVE }),
    ).toBeNull();
  });
});
