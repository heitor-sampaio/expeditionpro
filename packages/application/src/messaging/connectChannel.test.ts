import { describe, expect, it } from 'vitest';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { fakeChannelIntegrationRepository } from './channelIntegrationRepository.fake.js';
import { connectChannel } from './connectChannel.js';
import { listChannelIntegrations } from './listChannelIntegrations.js';
import { disconnectChannel } from './disconnectChannel.js';
import { ForbiddenError, NotFoundError, RequiredFieldError } from '../errors.js';
import type { RequestContext } from '../context.js';

function ctxCom(role: 'owner' | 'admin' | 'operator' | 'viewer'): RequestContext {
  return { tenantId: 'tenant-a', actor: { kind: 'team', userId: 'u1', role } };
}

function deps() {
  return { integrations: fakeChannelIntegrationRepository(), audit: fakeAuditLogRepository() };
}

const comando = {
  channel: 'whatsapp' as const,
  provider: 'evolution' as const,
  baseUrl: 'https://evo.drakkar.com.br',
  externalAccountId: 'drakkar',
  accessToken: 'CHAVE-DA-INSTANCIA',
};

/**
 * AT-01 — conectar o canal é o que faz o webhook existir.
 *
 * Mesmo peso do gateway de pagamento (PG-01): quem tem a chave da instância manda mensagem
 * **como a empresa**, para qualquer número da agenda. Por isso owner ou admin, e por isso o
 * segredo sai em claro uma única vez.
 */
describe('AT-01: conectar um canal', () => {
  it('guarda a conexão e devolve o segredo do webhook uma vez', async () => {
    const d = deps();

    const conectado = await connectChannel(
      { ...d, newSecret: () => 'SEGREDO-1' },
      ctxCom('owner'),
      comando,
    );

    expect(conectado.channel).toBe('whatsapp');
    expect(conectado.webhookToken).toBe('SEGREDO-1');
    expect(d.integrations.rows).toHaveLength(1);
  });

  it('reconectar mantém o segredo — trocar pararia de receber em silêncio', async () => {
    const d = deps();
    await connectChannel({ ...d, newSecret: () => 'SEGREDO-1' }, ctxCom('owner'), comando);

    const outra = await connectChannel({ ...d, newSecret: () => 'SEGREDO-2' }, ctxCom('owner'), {
      ...comando,
      accessToken: 'CHAVE-NOVA',
    });

    expect(outra.webhookToken).toBeNull();
    expect(d.integrations.rows).toHaveLength(1);
    expect(d.integrations.rows[0]?.webhookToken).toBe('SEGREDO-1');
    expect(d.integrations.rows[0]?.accessToken).toBe('CHAVE-NOVA');
  });

  it('operator não conecta canal — é a chave que fala pela empresa', async () => {
    await expect(connectChannel(deps(), ctxCom('operator'), comando)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('chave em branco é recusada antes de qualquer escrita', async () => {
    const d = deps();

    await expect(
      connectChannel(d, ctxCom('owner'), { ...comando, accessToken: '   ' }),
    ).rejects.toBeInstanceOf(RequiredFieldError);
    expect(d.integrations.rows).toHaveLength(0);
  });

  it('endereço que não é http é recusado', async () => {
    await expect(
      connectChannel(deps(), ctxCom('owner'), { ...comando, baseUrl: 'evo.drakkar.com.br' }),
    ).rejects.toBeInstanceOf(RequiredFieldError);
  });
});

describe('AT-01: listar e desconectar', () => {
  it('a listagem nunca devolve a chave, só o suficiente para conferir', async () => {
    const d = deps();
    await connectChannel({ ...d, newSecret: () => 'S' }, ctxCom('owner'), comando);

    const lista = await listChannelIntegrations(d, ctxCom('admin'));

    expect(lista).toHaveLength(1);
    expect(lista[0]?.tokenPreview).toBe('••••NCIA');
    expect(JSON.stringify(lista)).not.toContain('CHAVE-DA-INSTANCIA');
  });

  it('operator vê que o canal está conectado — precisa saber por que não chega mensagem', async () => {
    const d = deps();
    await connectChannel({ ...d, newSecret: () => 'S' }, ctxCom('owner'), comando);

    expect(await listChannelIntegrations(d, ctxCom('operator'))).toHaveLength(1);
  });

  it('desconectar remove a conexão', async () => {
    const d = deps();
    await connectChannel({ ...d, newSecret: () => 'S' }, ctxCom('owner'), comando);

    await disconnectChannel(d, ctxCom('owner'), { channel: 'whatsapp' });

    expect(d.integrations.rows).toHaveLength(0);
  });

  it('desconectar canal que não está conectado responde como se não existisse', async () => {
    await expect(
      disconnectChannel(deps(), ctxCom('owner'), { channel: 'instagram' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('operator não desconecta', async () => {
    const d = deps();
    await connectChannel({ ...d, newSecret: () => 'S' }, ctxCom('owner'), comando);

    await expect(
      disconnectChannel(d, ctxCom('operator'), { channel: 'whatsapp' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

/**
 * AT-02 — o campo que guarda de onde o provedor pode chamar.
 *
 * Fica no mesmo lugar da chave porque é a mesma decisão: quem opera o canal declara em que
 * servidor ele roda. Endereço inválido é recusado na hora — guardado, viraria uma cerca que
 * nunca deixa passar, e o sintoma apareceria só quando a mensagem não chegasse.
 */
describe('AT-02: endereços liberados na conexão', () => {
  it('guarda os endereços declarados', async () => {
    const d = deps();

    await connectChannel({ ...d, newSecret: () => 'S' }, ctxCom('owner'), {
      ...comando,
      allowedIps: ['69.62.88.81'],
    });

    expect(d.integrations.rows[0]?.allowedIps).toEqual(['69.62.88.81']);
  });

  it('sem o campo, a cerca nasce desligada', async () => {
    const d = deps();

    await connectChannel({ ...d, newSecret: () => 'S' }, ctxCom('owner'), comando);

    expect(d.integrations.rows[0]?.allowedIps).toEqual([]);
  });

  it('endereço inválido é recusado antes de qualquer escrita', async () => {
    const d = deps();

    await expect(
      connectChannel(d, ctxCom('owner'), { ...comando, allowedIps: ['evolution.meudominio.com'] }),
    ).rejects.toThrow(/evolution.meudominio.com/);
    expect(d.integrations.rows).toHaveLength(0);
  });

  it('endereço repetido entra uma vez só', async () => {
    const d = deps();

    await connectChannel({ ...d, newSecret: () => 'S' }, ctxCom('owner'), {
      ...comando,
      allowedIps: ['69.62.88.81', '69.62.88.81'],
    });

    expect(d.integrations.rows[0]?.allowedIps).toEqual(['69.62.88.81']);
  });

  it('a listagem mostra os endereços — a equipe precisa conferir a cerca', async () => {
    const d = deps();
    await connectChannel({ ...d, newSecret: () => 'S' }, ctxCom('owner'), {
      ...comando,
      allowedIps: ['69.62.88.81'],
    });

    const lista = await listChannelIntegrations(d, ctxCom('operator'));

    expect(lista[0]?.allowedIps).toEqual(['69.62.88.81']);
  });
});
