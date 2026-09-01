import { useCallback, useEffect, useState } from 'react';
import { api } from '../auth/api.js';
import { familyErrorFor } from './familyActions.js';
import type { CustomerDto } from './useCustomerSearch.js';

/**
 * Família com os dados completos, para a equipe editar a ficha (CL-06). Leitura em
 * `GET /v1/customers/:id/family`; a escrita é um `PATCH` por membro alterado — a regra
 * (identidade exige owner/admin, CPF único, §3.2 no responsável) mora no servidor.
 */

export interface FamilyEditPatch {
  fullName?: string;
  cpf?: string;
  birthDate?: string;
  email?: string;
  phone?: string;
  address?: {
    street?: string;
    number?: string;
    district?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
}

export type FamilyState =
  | { status: 'loading' }
  | { status: 'ready'; responsible: CustomerDto; companions: CustomerDto[] }
  | { status: 'error' }
  | { status: 'forbidden' };

export type SaveResult = { ok: true } | { ok: false; message: string };

export function useCustomerFamily(customerId: string) {
  const [state, setState] = useState<FamilyState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setState({ status: 'loading' });
    const controller = new AbortController();
    api(`/v1/customers/${customerId}/family`, { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 403) {
          setState({ status: 'forbidden' });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { responsible: CustomerDto; companions: CustomerDto[] };
        setState({ status: 'ready', ...body });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [customerId, reloadKey]);

  const save = useCallback(async (id: string, patch: FamilyEditPatch): Promise<SaveResult> => {
    setSaving(true);
    try {
      const res = await api(`/v1/customers/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        return { ok: false, message: editErrorFor(payload.error ?? '') };
      }
      return { ok: true };
    } catch {
      return { ok: false, message: familyErrorFor('network') };
    } finally {
      setSaving(false);
    }
  }, []);

  /** CL-03 — remove um acompanhante sem histórico (o servidor recusa quem já viajou). */
  const remove = useCallback(async (id: string): Promise<SaveResult> => {
    setSaving(true);
    try {
      const res = await api(`/v1/customers/${id}`, { method: 'DELETE' });
      if (res.status === 204) return { ok: true };
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, message: editErrorFor(payload.error ?? '') };
    } catch {
      return { ok: false, message: familyErrorFor('network') };
    } finally {
      setSaving(false);
    }
  }, []);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);
  return { state, saving, save, remove, refresh };
}

/** Códigos que só a edição produz; o resto cai no vocabulário comum de vínculo. */
function editErrorFor(code: string): string {
  switch (code) {
    case 'invalid_cpf':
      return 'CPF inválido — confira os dígitos.';
    case 'duplicate_cpf':
      return 'Este CPF já está em outro cadastro deste tenant.';
    case 'invalid_phone':
      return 'Telefone inválido — use DDD + número.';
    case 'invalid_birth_date':
      return 'Data de nascimento inválida.';
    case 'required_field':
      return 'O responsável precisa de e-mail e telefone.';
    case 'forbidden':
      return 'Alterar identidade ou remover cadastro exige owner ou admin.';
    case 'has_history':
      return 'Já participou de uma saída ou tem cashback: o histórico não se apaga.';
    case 'not_a_companion':
      return 'Só acompanhante pode ser removido aqui.';
    default:
      return familyErrorFor(code);
  }
}
