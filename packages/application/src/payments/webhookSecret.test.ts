import { describe, expect, it } from 'vitest';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { fakePaymentIntegrationRepository } from './paymentIntegrationRepository.fake.js';
import { fakePaymentGateway } from './paymentGateway.fake.js';
import { connectPaymentProvider } from './connectPaymentProvider.js';
import type { RequestContext } from '../context.js';

/**
 * PG-01 · SEC-01 — o segredo de webhook não fica em claro no banco.
 *
 * Era o **único segredo do sistema guardado em texto claro**: a API key de intake é
 * `sha256`, o access token do gateway é AES-256-GCM, e este ficou cru — enquanto é
 * justamente o que separa a internet de "marcar inscrição como paga". Qualquer leitura do
 * banco (backup, dump, credencial de leitura vazada) entregava esse poder.
 *
 * **Por que hash e não cifra**, que é o oposto do que parecia à primeira vista:
 *
 * · Hash **migra limpo em SQL** (`encode(sha256(...))`), porque não precisa de chave. Cifra
 *   exigiria a `PAYMENT_TOKEN_KEY`, que vive no ambiente do app e não no Postgres — a linha
 *   que já existe ficaria em claro até alguém reconectar.
 * · A objeção contra hash era que reconectar exigiria reconfigurar o webhook no ASAAS. Não
 *   exige: reconectar **mantém a linha existente**, sem gerar segredo novo. O token não
 *   muda, apenas deixa de ser legível — o que é o objetivo.
 *
 * O preço é que o segredo aparece **uma vez só**, na conexão. É o mesmo contrato da API
 * key de intake, e a tela já trata isso.
 */

const owner: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'owner' },
};

const clock = () => new Date('2026-09-01T12:00:00Z');

function deps() {
  return {
    integrations: fakePaymentIntegrationRepository(),
    gateway: fakePaymentGateway(),
    audit: fakeAuditLogRepository(),
    clock,
  };
}

describe('PG-01: o segredo de webhook sai uma vez e some do banco', () => {
  it('a primeira conexão devolve o segredo em claro', async () => {
    const d = deps();

    const conectado = await connectPaymentProvider(d, owner, {
      environment: 'sandbox',
      accessToken: 'aact_chave',
    });

    expect(conectado.webhookToken).toBeTruthy();
    expect(conectado.webhookToken).toMatch(/^whk_/);
  });

  it('o banco guarda o hash, não o segredo', async () => {
    const d = deps();

    const conectado = await connectPaymentProvider(d, owner, {
      environment: 'sandbox',
      accessToken: 'aact_chave',
    });

    const guardado = d.integrations.rows[0];
    expect(guardado?.webhookTokenHash).toBeTruthy();
    expect(guardado?.webhookTokenHash).not.toBe(conectado.webhookToken);
    // Nenhum campo do registro guarda o valor em claro.
    expect(JSON.stringify(guardado)).not.toContain(conectado.webhookToken!);
  });

  it('reconectar NÃO troca o segredo — o webhook no ASAAS continua valendo', async () => {
    const d = deps();
    const primeira = await connectPaymentProvider(d, owner, {
      environment: 'sandbox',
      accessToken: 'aact_chave',
    });
    const hashInicial = d.integrations.rows[0]?.webhookTokenHash;

    const segunda = await connectPaymentProvider(d, owner, {
      environment: 'sandbox',
      accessToken: 'aact_outra_chave',
    });

    // Mesmo hash guardado: o segredo não mudou.
    expect(d.integrations.rows[0]?.webhookTokenHash).toBe(hashInicial);
    // E não é devolvido de novo — não dá para relê-lo, só para saber que segue o mesmo.
    expect(segunda.webhookToken).toBeNull();
    expect(primeira.webhookToken).toBeTruthy();
  });

  it('o segredo apresentado autentica; um parecido, não', async () => {
    const d = deps();
    const conectado = await connectPaymentProvider(d, owner, {
      environment: 'sandbox',
      accessToken: 'aact_chave',
    });

    expect(
      await d.integrations.findByWebhookToken('tenant-a', conectado.webhookToken!),
    ).not.toBeNull();
    expect(
      await d.integrations.findByWebhookToken('tenant-a', `${conectado.webhookToken!}x`),
    ).toBeNull();
  });
});
