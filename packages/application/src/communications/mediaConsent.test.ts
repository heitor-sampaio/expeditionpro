import { describe, expect, it } from 'vitest';
import { fakeMediaConsentRepository } from './mediaConsentRepository.fake.js';
import { getMediaConsents } from './getMediaConsents.js';
import { setMediaConsent } from './setMediaConsent.js';
import { ForbiddenError } from '../errors.js';
import type { RequestContext } from '../context.js';

const customer = (id: string): RequestContext => ({
  tenantId: 'tenant-a',
  actor: { kind: 'customer', userId: `auth-${id}`, customerId: id },
});

function deps() {
  const media = fakeMediaConsentRepository();
  let t = 0;
  return { media, clock: () => new Date(Date.UTC(2026, 0, 1, 0, 0, t++)) };
}

describe('CO-10: consentimento de uso de imagem', () => {
  it('nasce desmarcado; conceder community liga só esse escopo', async () => {
    const d = deps();
    expect(await getMediaConsents(d, customer('c1'), { customerId: 'c1' })).toEqual({
      community: false,
      marketing: false,
    });
    await setMediaConsent(d, customer('c1'), {
      customerId: 'c1',
      scope: 'community',
      granted: true,
    });
    expect(await getMediaConsents(d, customer('c1'), { customerId: 'c1' })).toEqual({
      community: true,
      marketing: false,
    });
  });

  it('revogar tem efeito imediato e preserva o histórico', async () => {
    const d = deps();
    await setMediaConsent(d, customer('c1'), {
      customerId: 'c1',
      scope: 'community',
      granted: true,
    });
    await setMediaConsent(d, customer('c1'), {
      customerId: 'c1',
      scope: 'community',
      granted: false,
    });
    const state = await getMediaConsents(d, customer('c1'), { customerId: 'c1' });
    expect(state.community).toBe(false);
    expect(d.media.rows).toHaveLength(1);
    expect(d.media.rows[0]!.revokedAt).not.toBeNull();
  });

  it('o cliente não gerencia o consentimento de outro (403)', async () => {
    const d = deps();
    await expect(getMediaConsents(d, customer('c1'), { customerId: 'c2' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      setMediaConsent(d, customer('c1'), { customerId: 'c2', scope: 'community', granted: true }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
