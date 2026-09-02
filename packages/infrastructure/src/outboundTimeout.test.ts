import { describe, expect, it } from 'vitest';
import { asaasGateway } from './payments/asaasGateway.js';
import { supabaseAuthAdmin } from './auth/supabaseAuthAdmin.js';
import { resendNotificationGateway } from './notifications/resendNotificationGateway.js';

/**
 * SEC — chamada de saída tem prazo.
 *
 * Nenhuma das três tinha. Um serviço de fora que aceita a conexão e nunca responde — o modo
 * de falha mais comum de API sob carga, e o mais difícil de perceber — prendia a requisição
 * do nosso lado para sempre. Cada uma segura uma conexão do pool e uma requisição do cliente;
 * algumas dezenas bastam para o servidor parar de aceitar gente nova, sem um único erro no
 * log. `fetch` sem sinal não tem prazo nenhum em Node.
 *
 * A asserção é pelo **nome do erro**, não por "rejeitou". A primeira versão deste teste
 * passava sem implementação nenhuma: as opções que eu inventava eram ignoradas, o `fetch`
 * real saía para um host inventado e falhava — verde, testando rede. `TimeoutError` só
 * aparece se o duplo abaixo foi mesmo usado **e** o sinal chegou até ele.
 */

/** Aceita a conexão e nunca responde — só reage ao abort, como um servidor travado faria. */
const nuncaResponde: typeof fetch = (_url, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      reject(new DOMException('The operation was aborted.', 'TimeoutError'));
    });
  });

const CREDENCIAIS = { environment: 'sandbox' as const, accessToken: 'token-de-teste' };

describe('SEC: toda chamada de saída desiste', () => {
  it('o gateway de pagamento desiste em vez de esperar para sempre', async () => {
    const gateway = asaasGateway(nuncaResponde, 30);

    await expect(gateway.checkAccount(CREDENCIAIS)).rejects.toMatchObject({
      name: 'TimeoutError',
    });
  });

  it('o admin de identidade desiste — convite não pode prender a requisição', async () => {
    const admin = supabaseAuthAdmin({
      url: 'https://x.supabase.co',
      serviceRoleKey: 'chave',
      fetchImpl: nuncaResponde,
      timeoutMs: 30,
    });

    await expect(
      admin.inviteTeamMember({ email: 'a@b.com', tenantId: 't1', role: 'operator' }),
    ).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('o envio de e-mail desiste — notificação é best-effort, não motivo de travar', async () => {
    const gateway = resendNotificationGateway({
      apiKey: 'chave',
      from: 'drakkar@exemplo.com',
      fetchImpl: nuncaResponde,
      timeoutMs: 30,
    });

    await expect(
      gateway.sendBookingNotification({
        kind: 'confirmed',
        to: 'cliente@exemplo.com',
        customerName: 'Ana Prado',
        groupName: 'Coxilha Rica · outubro',
        startDate: '2026-10-10',
        endDate: '2026-10-12',
      }),
    ).rejects.toMatchObject({ name: 'TimeoutError' });
  });
});
