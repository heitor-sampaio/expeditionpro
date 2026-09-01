import { describe, expect, it } from 'vitest';
import { fakeCommunicationConsentRepository } from './communicationConsentRepository.fake.js';
import { getCommunicationConsents } from './getCommunicationConsents.js';
import { setCommunicationConsent } from './setCommunicationConsent.js';
import { ForbiddenError } from '../errors.js';
import type { RequestContext } from '../context.js';

const owner: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'owner' },
};
const customer = (customerId: string): RequestContext => ({
  tenantId: 'tenant-a',
  actor: { kind: 'customer', userId: `auth-${customerId}`, customerId },
});

function deps() {
  const consents = fakeCommunicationConsentRepository();
  let t = 0;
  const clock = () => new Date(Date.UTC(2026, 0, 1, 0, 0, t++));
  return { consents, clock };
}

describe('DOC-06/CM-04: consentimento de comunicação por canal', () => {
  it('nasce desmarcado (nenhum canal ativo)', async () => {
    const d = deps();
    const state = await getCommunicationConsents(d, customer('c1'), { customerId: 'c1' });
    expect(state).toEqual({ email: false, push: false });
  });

  it('conceder e-mail liga só o e-mail', async () => {
    const d = deps();
    await setCommunicationConsent(d, customer('c1'), {
      customerId: 'c1',
      channel: 'email',
      granted: true,
    });
    const state = await getCommunicationConsents(d, customer('c1'), { customerId: 'c1' });
    expect(state).toEqual({ email: true, push: false });
  });

  it('opt-out de um clique revoga o canal (CM-04) mas preserva o histórico', async () => {
    const d = deps();
    await setCommunicationConsent(d, customer('c1'), {
      customerId: 'c1',
      channel: 'email',
      granted: true,
    });
    await setCommunicationConsent(d, customer('c1'), {
      customerId: 'c1',
      channel: 'email',
      granted: false,
    });
    const state = await getCommunicationConsents(d, customer('c1'), { customerId: 'c1' });
    expect(state.email).toBe(false);
    // ledger preservado: a linha revogada continua lá (ônus da prova)
    expect(d.consents.rows).toHaveLength(1);
    expect(d.consents.rows[0]!.revokedAt).not.toBeNull();
  });

  it('conceder de novo depois de revogar cria nova linha ativa', async () => {
    const d = deps();
    await setCommunicationConsent(d, customer('c1'), {
      customerId: 'c1',
      channel: 'email',
      granted: true,
    });
    await setCommunicationConsent(d, customer('c1'), {
      customerId: 'c1',
      channel: 'email',
      granted: false,
    });
    await setCommunicationConsent(d, customer('c1'), {
      customerId: 'c1',
      channel: 'email',
      granted: true,
    });
    expect(d.consents.rows).toHaveLength(2);
    const state = await getCommunicationConsents(d, customer('c1'), { customerId: 'c1' });
    expect(state.email).toBe(true);
  });

  it('conceder duas vezes seguidas é idempotente (não duplica linha ativa)', async () => {
    const d = deps();
    await setCommunicationConsent(d, customer('c1'), {
      customerId: 'c1',
      channel: 'push',
      granted: true,
    });
    await setCommunicationConsent(d, customer('c1'), {
      customerId: 'c1',
      channel: 'push',
      granted: true,
    });
    expect(d.consents.rows.filter((r) => r.revokedAt === null)).toHaveLength(1);
  });

  it('o cliente não gerencia consentimento de outro (403)', async () => {
    const d = deps();
    await expect(
      getCommunicationConsents(d, customer('c1'), { customerId: 'c2' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      setCommunicationConsent(d, customer('c1'), {
        customerId: 'c2',
        channel: 'email',
        granted: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('a equipe consulta o consentimento de qualquer cliente', async () => {
    const d = deps();
    await setCommunicationConsent(d, owner, { customerId: 'c9', channel: 'email', granted: true });
    const state = await getCommunicationConsents(d, owner, { customerId: 'c9' });
    expect(state.email).toBe(true);
  });
});
