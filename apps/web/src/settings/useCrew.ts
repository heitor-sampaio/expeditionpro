import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';

/**
 * CF-05 — o condutor da empresa: quem abre a roomlist e o comboio. Só chamada; toda a
 * validação (CPF, nascimento, telefone, placa) é do servidor.
 */

export interface CrewAddress {
  street: string;
  number: string;
  district: string;
  city: string;
  state: string;
  zip: string;
}

export interface CrewCompanion {
  fullName: string;
  birthDate: string;
}

export interface CrewVehicle {
  brand: string;
  model: string;
  plate: string;
}

export interface CrewLead {
  fullName: string;
  cpf: string;
  birthDate: string;
  email: string | null;
  phone: string | null;
  address: Partial<CrewAddress>;
  vehicle: CrewVehicle | null;
  companions: CrewCompanion[];
}

export type CrewState =
  | { status: 'loading' }
  | { status: 'ready'; lead: CrewLead | null }
  | { status: 'error' }
  | { status: 'forbidden' };

export type SaveResult = { ok: true } | { ok: false; message: string };

export function useCrew() {
  const [state, setState] = useState<CrewState>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setState({ status: 'loading' });
    const controller = new AbortController();
    api('/v1/crew', { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          setState({ status: 'forbidden' });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        setState({ status: 'ready', lead: (await res.json()) as CrewLead | null });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [reloadKey]);

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  const save = useCallback(async (lead: unknown): Promise<SaveResult> => {
    setBusy(true);
    try {
      const res = await api('/v1/crew', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(lead),
      });
      if (!res.ok) {
        const parsed = (await res.json().catch(() => ({}))) as { error?: string; field?: string };
        return { ok: false, message: messageFor(parsed.error, parsed.field, res.status) };
      }
      setState({ status: 'ready', lead: (await res.json()) as CrewLead | null });
      return { ok: true };
    } catch {
      return { ok: false, message: 'Falha de conexão.' };
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, refresh, save };
}

function messageFor(code: string | undefined, field: string | undefined, status: number): string {
  const map: Record<string, string> = {
    invalid_cpf: 'CPF inválido. Confira os dígitos.',
    invalid_birth_date: 'Data de nascimento inválida.',
    invalid_phone: 'Telefone inválido. Use DDD + número.',
    invalid_plate: 'Placa inválida. Use o formato ABC1234 ou ABC1D23.',
    validation_failed: 'Confira os dados antes de salvar.',
  };
  if (code === 'required_field') {
    return field ? `Preencha: ${field}.` : 'Preencha os campos obrigatórios.';
  }
  if (code && map[code]) return map[code];
  if (status === 401 || status === 403) return 'Editar a equipe exige owner ou admin.';
  return 'Não foi possível salvar. Tente de novo.';
}
