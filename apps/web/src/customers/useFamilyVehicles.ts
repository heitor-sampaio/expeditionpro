import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';
import { plateErrorFor, topErrorFor } from './errorMessages.js';
import type { VehicleDraft } from './VehicleFields.js';

/**
 * Veículos da família (CL-05) no back-office: lê os do responsável, edita os existentes
 * e anexa um novo. Regras (placa, catálogo, "Outro") no servidor; aqui só a chamada e a
 * tradução do código de erro.
 */

export interface VehicleDto {
  id: string;
  plate: string;
  brandId: string | null;
  brandOther: string | null;
  modelId: string | null;
  modelOther: string | null;
  needsCatalogReview: boolean;
}

export type VehicleSaveResult = { ok: true } | { ok: false; message: string };

export function useFamilyVehicles(customerId: string) {
  const [vehicles, setVehicles] = useState<VehicleDto[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api(`/v1/customers/${customerId}/vehicles`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setVehicles((await res.json()) as VehicleDto[]);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setVehicles([]); // sem veículo listado, o bloco ainda oferece anexar um
        }
      });
    return () => controller.abort();
  }, [customerId, reloadKey]);

  const update = useCallback(
    (vehicleId: string, draft: VehicleDraft) => send(`/v1/vehicles/${vehicleId}`, 'PATCH', draft),
    [],
  );

  const create = useCallback(
    (ownerId: string, draft: VehicleDraft) =>
      send(`/v1/customers/${ownerId}/vehicles`, 'POST', draft),
    [],
  );

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);
  return { vehicles, update, create, refresh };
}

async function send(
  path: string,
  method: 'POST' | 'PATCH',
  draft: VehicleDraft,
): Promise<VehicleSaveResult> {
  try {
    const res = await api(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(toPayload(draft)),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    const code = body.error ?? 'unknown';
    return { ok: false, message: plateErrorFor(code) ?? topErrorFor(code) };
  } catch {
    return { ok: false, message: topErrorFor('network') };
  }
}

/** O servidor recebe a escolha inteira: id do catálogo OU texto livre, nunca os dois. */
function toPayload(draft: VehicleDraft): Record<string, string> {
  const payload: Record<string, string> = { plate: draft.plate.trim() };
  if (draft.brandId !== null) payload.brandId = draft.brandId;
  else if (draft.brandOther?.trim()) payload.brandOther = draft.brandOther.trim();
  if (draft.modelId !== null) payload.modelId = draft.modelId;
  else if (draft.modelOther?.trim()) payload.modelOther = draft.modelOther.trim();
  return payload;
}
