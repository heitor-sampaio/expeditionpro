import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';

/**
 * Consentimento de uso de imagem (§5.12 · CO-10). O cliente autoriza (ou revoga) o uso da
 * própria imagem na comunidade. Desmarcado por padrão; revogável a qualquer momento.
 */

export interface MediaConsentState {
  community: boolean;
  marketing: boolean;
}

export function useMediaConsent(customerId: string) {
  const [state, setState] = useState<MediaConsentState | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api(`/v1/customers/${customerId}/media-consents`, { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<MediaConsentState>) : null))
      .then((s) => s && setState(s))
      .catch(() => undefined);
    return () => controller.abort();
  }, [customerId, reloadKey]);

  const setScope = useCallback(
    async (scope: 'community' | 'marketing', granted: boolean) => {
      setBusy(true);
      try {
        const res = await api(`/v1/customers/${customerId}/media-consents/${scope}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ granted }),
        });
        if (res.ok) {
          setState((await res.json()) as MediaConsentState);
        } else {
          setReloadKey((k) => k + 1);
        }
      } finally {
        setBusy(false);
      }
    },
    [customerId],
  );

  return { state, busy, setScope };
}
