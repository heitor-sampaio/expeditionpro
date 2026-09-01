import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';

/**
 * Cupons do tenant (§5.15). O hook só conversa com o servidor: formato do código,
 * faixa do percentual, janela de validade e limite de uso são regra de lá — a tela
 * envia e mostra o motivo que voltar.
 */

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  mode: 'percent' | 'fixed';
  value: number;
  active: boolean;
  validFrom: string | null;
  validUntil: string | null;
  maxUses: number | null;
  maxUsesPerCustomer: number | null;
  itineraryId: string | null;
  groupId: string | null;
  customerId: string | null;
  uses: number;
}

export interface CouponDraft {
  code: string;
  mode: 'percent' | 'fixed';
  value: number;
  description?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  maxUses?: number | null;
  maxUsesPerCustomer?: number | null;
}

export type CouponsState =
  | { status: 'loading' }
  | { status: 'ready'; coupons: Coupon[] }
  | { status: 'error' }
  | { status: 'forbidden' };

export type CouponResult = { ok: true } | { ok: false; message: string };

export function useCoupons() {
  const [state, setState] = useState<CouponsState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setState({ status: 'loading' });
    const controller = new AbortController();
    api('/v1/coupons', { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          setState({ status: 'forbidden' });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        setState({ status: 'ready', coupons: (await res.json()) as Coupon[] });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const send = useCallback(
    async (url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) => {
      setBusy(true);
      try {
        const res = await api(url, {
          method,
          ...(body === undefined
            ? {}
            : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
        });
        if (!res.ok) {
          const parsed = (await res.json().catch(() => ({}))) as { error?: string };
          return { ok: false as const, message: messageFor(parsed.error, res.status) };
        }
        setReloadKey((k) => k + 1);
        return { ok: true as const };
      } catch {
        return { ok: false as const, message: 'Falha de conexão.' };
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return {
    state,
    busy,
    refresh,
    create: (draft: CouponDraft): Promise<CouponResult> => send('/v1/coupons', 'POST', draft),
    setActive: (couponId: string, active: boolean): Promise<CouponResult> =>
      send(`/v1/coupons/${couponId}`, 'PATCH', { active }),
    remove: (couponId: string): Promise<CouponResult> => send(`/v1/coupons/${couponId}`, 'DELETE'),
  };
}

function messageFor(code: string | undefined, status: number): string {
  const map: Record<string, string> = {
    invalid_code: 'O código vai de 3 a 24 caracteres, com letras, números e hífen.',
    code_taken: 'Já existe um cupom com esse código.',
    invalid_value: 'O desconto precisa ser maior que zero, e o percentual até 100.',
    invalid_window: 'A validade termina antes de começar.',
    invalid_limit: 'O limite de usos precisa ser maior que zero.',
    ambiguous_scope: 'Escolha restringir por roteiro ou por saída, não os dois.',
    validation_failed: 'Confira os dados antes de salvar.',
    not_found: 'Este cupom não existe mais.',
  };
  if (code && map[code]) return map[code];
  if (status === 401 || status === 403) return 'Criar e editar cupom exige owner ou admin.';
  return 'Não foi possível concluir. Tente de novo.';
}
