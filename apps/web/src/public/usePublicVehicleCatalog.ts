import { useEffect, useState } from 'react';
import { publicApi, PUBLIC_TENANT_SLUG } from './publicApi.js';
import type { ComboItem } from '../ui/Combobox.js';

/**
 * CL-05 · IN-25 — o catálogo de veículos na página pública.
 *
 * Igual ao do back-office em forma e diferente em duas coisas que importam: pede por rota
 * pública, sem `Authorization`, e o tenant vem do slug do link em vez da sessão.
 *
 * **Falha vira lista vazia, sempre.** Sem catálogo o combobox mostra só "Outro", que é texto
 * livre — a inscrição continua possível. Deixar o erro subir daria uma tela quebrada no lugar
 * de um campo que ainda funciona.
 */

export function usePublicVehicleBrands(): ComboItem[] {
  const [brands, setBrands] = useState<ComboItem[]>([]);

  useEffect(() => {
    let alive = true;
    publicApi(`/v1/public/${encodeURIComponent(PUBLIC_TENANT_SLUG)}/vehicle-brands`)
      .then((res) => (res.ok ? (res.json() as Promise<ComboItem[]>) : []))
      .then((data) => {
        if (alive) setBrands(data);
      })
      .catch(() => {
        if (alive) setBrands([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  return brands;
}

/** Os modelos da marca escolhida. Sem marca — ou com "Outro" — não há cascata a fazer. */
export function usePublicVehicleModels(brandId: string | null): ComboItem[] {
  const [models, setModels] = useState<ComboItem[]>([]);

  useEffect(() => {
    if (brandId === null) {
      setModels([]);
      return;
    }
    let alive = true;
    publicApi(
      `/v1/public/${encodeURIComponent(PUBLIC_TENANT_SLUG)}/vehicle-brands/${encodeURIComponent(brandId)}/models`,
    )
      .then((res) => (res.ok ? (res.json() as Promise<ComboItem[]>) : []))
      .then((data) => {
        if (alive) setModels(data);
      })
      .catch(() => {
        if (alive) setModels([]);
      });
    return () => {
      alive = false;
    };
  }, [brandId]);

  return models;
}
