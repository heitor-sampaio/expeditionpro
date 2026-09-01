import { useState } from 'react';
import { api } from '../auth/api.js';
import { familyErrorFor } from './familyActions.js';

/**
 * Reorganização de vínculo (CL-10) e merge de duplicados (CL-07), ações de back-office.
 * Toda a regra está no servidor: aqui só disparamos a chamada e traduzimos o código de
 * erro para uma frase. Nenhuma decisão de negócio vive na tela.
 */

export type FamilyActionResult = { ok: true } | { ok: false; message: string };

export function useFamilyActions(customerId: string) {
  const [busy, setBusy] = useState(false);

  const post = async (path: string, body: unknown): Promise<FamilyActionResult> => {
    setBusy(true);
    try {
      const res = await api(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        return { ok: false, message: familyErrorFor(payload.error ?? '') };
      }
      return { ok: true };
    } catch {
      return { ok: false, message: familyErrorFor('network') };
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    /** CL-10 — vincula este cliente como acompanhante do responsável escolhido. */
    move: (responsibleId: string) => post(`/v1/customers/${customerId}/move`, { responsibleId }),
    /** CL-10 — este cliente passa a ser responsável, levando os acompanhantes marcados. */
    promote: (bringCompanionIds: readonly string[]) =>
      post(`/v1/customers/${customerId}/promote`, { bringCompanionIds }),
    /** CL-07 — este cliente sobrevive; o duplicado some e o histórico vem para cá. */
    merge: (duplicateId: string) =>
      post('/v1/customers/merge', { survivorId: customerId, duplicateId }),
  };
}
