import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';
import type { StageKind } from './dropTarget.js';

/**
 * §5.16 — o quadro do funil.
 *
 * Zero regra aqui: mover cartão, recusar ganho e exigir motivo de perda são do servidor, e é
 * lá que estão testados. Este hook carrega, chama e traduz erro para português.
 */

export interface BoardStage {
  id: string;
  name: string;
  position: number;
  kind: StageKind;
}

export interface BoardOpportunity {
  id: string;
  stageId: string;
  contactName: string;
  phone: string | null;
  email: string | null;
  itineraryId: string | null;
  expectedValueCents: number | null;
  source: 'manual' | 'whatsapp' | 'instagram' | 'messenger' | 'site';
  lostReason: string | null;
  createdAt: string;
}

export interface BoardColumn {
  stage: BoardStage;
  opportunities: BoardOpportunity[];
  /** OP-09: previsão, nunca caixa. A tela é obrigada a rotular. */
  expectedValueCents: number;
}

export type BoardState =
  | { status: 'loading' }
  | { status: 'ready'; columns: BoardColumn[] }
  | { status: 'error' }
  | { status: 'forbidden' };

export type ActionResult = { ok: true } | { ok: false; message: string };

export function useBoard() {
  const [state, setState] = useState<BoardState>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setState({ status: 'loading' });
    const controller = new AbortController();
    api('/v1/crm/board', { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          setState({ status: 'forbidden' });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        setState({ status: 'ready', columns: (await res.json()) as BoardColumn[] });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const chamar = useCallback(
    async (caminho: string, init: RequestInit): Promise<ActionResult> => {
      setBusy(true);
      try {
        const res = await api(caminho, {
          ...init,
          headers: { 'content-type': 'application/json', ...init.headers },
        });
        if (!res.ok) {
          const corpo = (await res.json().catch(() => ({}))) as { error?: string };
          return { ok: false, message: mensagem(corpo.error, res.status) };
        }
        refresh();
        return { ok: true };
      } catch {
        return { ok: false, message: 'Falha de conexão.' };
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const criar = useCallback(
    (dados: {
      contactName: string;
      phone?: string;
      expectedValueCents?: number;
      itineraryId?: string;
    }) => chamar('/v1/crm/opportunities', { method: 'POST', body: JSON.stringify(dados) }),
    [chamar],
  );

  const mover = useCallback(
    (opportunityId: string, stageId: string, lostReason?: string) =>
      chamar(`/v1/crm/opportunities/${encodeURIComponent(opportunityId)}/stage`, {
        method: 'PATCH',
        body: JSON.stringify({ stageId, ...(lostReason ? { lostReason } : {}) }),
      }),
    [chamar],
  );

  const definirRoteiro = useCallback(
    (opportunityId: string, itineraryId: string | null) =>
      chamar(`/v1/crm/opportunities/${encodeURIComponent(opportunityId)}/itinerary`, {
        method: 'PATCH',
        body: JSON.stringify({ itineraryId }),
      }),
    [chamar],
  );

  return { state, busy, refresh, criar, mover, definirRoteiro };
}

/**
 * O código de erro do servidor vira frase em português. A tela nunca vê status HTTP — é o
 * padrão de `useTeamMembers` e `useCrew`.
 */
function mensagem(codigo: string | undefined, status: number): string {
  if (codigo === 'use_conversion')
    return 'Fechar negócio cria a inscrição, e isso ainda não está pronto — por enquanto a coluna de ganho não recebe cartão.';
  if (codigo === 'lost_reason_required') return 'Para dar como perdida, diga o motivo.';
  if (codigo === 'opportunity_closed')
    return 'Esta oportunidade virou inscrição e não se move mais.';
  if (codigo === 'stage_in_use') return 'Mova as oportunidades desta etapa antes de removê-la.';
  if (codigo === 'duplicate_stage') return 'Já existe uma etapa com esse nome.';
  if (codigo === 'incomplete_stage_order') return 'Não foi possível salvar a nova ordem.';
  if (status === 401 || status === 403) return 'Seu perfil não permite esta ação.';
  if (status === 404) return 'Não encontrado.';
  return 'Não foi possível concluir.';
}
