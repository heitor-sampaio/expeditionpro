import { useEffect, useState } from 'react';
import { api } from '../auth/api.js';
import type { ComboItem } from '../ui/Combobox.js';

/** Carrega as marcas do catálogo (CL-05). Falha silenciosa vira lista vazia → usa "Outro". */
export function useVehicleBrands(): ComboItem[] {
  const [brands, setBrands] = useState<ComboItem[]>([]);
  useEffect(() => {
    let alive = true;
    api('/v1/vehicle-brands')
      .then((res) => res.json() as Promise<ComboItem[]>)
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

/** Carrega os modelos da marca escolhida (cascata). Sem marca, lista vazia. */
export function useVehicleModels(brandId: string | null): ComboItem[] {
  const [models, setModels] = useState<ComboItem[]>([]);
  useEffect(() => {
    if (brandId === null) {
      setModels([]);
      return;
    }
    let alive = true;
    api(`/v1/vehicle-brands/${brandId}/models`)
      .then((res) => res.json() as Promise<ComboItem[]>)
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
