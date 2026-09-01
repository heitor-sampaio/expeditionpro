import { useEffect, useState } from 'react';
import { api } from '../auth/api.js';

/**
 * IN-17c — detalhe do item da fila. O `groupId` entra na consulta porque **idade e valor
 * dependem da saída** (§3.4): trocar o grupo no seletor recalcula tudo.
 */

export interface IntakePersonDto {
  fullName: string;
  cpf: string;
  birthDate: string;
  age: number | null;
  band: string | null;
}

export interface IntakeDetailDto {
  id: string;
  source: string;
  status: string;
  chosenGroupId: string | null;
  responsible: IntakePersonDto & {
    email: string;
    phoneDigits: string;
    phoneDisplay: string;
    existingCustomerId: string | null;
    cashbackBalanceCents: number;
  };
  companions: IntakePersonDto[];
  quote: {
    groupId: string;
    groupName: string;
    startDate: string;
    endDate: string;
    totalCents: number;
  } | null;
}

export type DetailState =
  { status: 'loading' } | { status: 'ready'; detail: IntakeDetailDto } | { status: 'error' };

export function useIntakeDetail(intakeId: string | null, groupId: string): DetailState {
  const [state, setState] = useState<DetailState>({ status: 'loading' });

  useEffect(() => {
    if (!intakeId) return;
    setState({ status: 'loading' });
    const controller = new AbortController();
    const query = groupId ? `?groupId=${encodeURIComponent(groupId)}` : '';
    api(`/v1/intake/${intakeId}${query}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setState({ status: 'ready', detail: (await res.json()) as IntakeDetailDto });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [intakeId, groupId]);

  return state;
}
