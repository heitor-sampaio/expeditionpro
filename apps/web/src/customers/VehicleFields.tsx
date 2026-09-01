import { Combobox } from '../ui/Combobox.js';
import { useVehicleBrands, useVehicleModels } from './useVehicleCatalog.js';

/**
 * Campos de um veículo (CL-05): placa + marca/modelo em combobox filtrável com "Outro"
 * e cascata marca→modelo (modelo desabilitado sem marca). Só coleta — placa, catálogo e
 * a fila de catalogação são resolvidos no servidor.
 */

export interface VehicleDraft {
  plate: string;
  brandId: string | null;
  brandOther: string | null;
  modelId: string | null;
  modelOther: string | null;
}

export const EMPTY_VEHICLE_DRAFT: VehicleDraft = {
  plate: '',
  brandId: null,
  brandOther: null,
  modelId: null,
  modelOther: null,
};

export function VehicleFields({
  value,
  onChange,
}: {
  readonly value: VehicleDraft;
  readonly onChange: (next: VehicleDraft) => void;
}): React.JSX.Element {
  const brands = useVehicleBrands();
  const models = useVehicleModels(value.brandId);
  const modelDisabled = value.brandId === null && value.brandOther === null;

  return (
    <div className="form-grid">
      <label className="field">
        <span className="field-label">Placa</span>
        <input
          className="field-input is-mono"
          value={value.plate}
          onChange={(e) => onChange({ ...value, plate: e.target.value.toUpperCase() })}
          placeholder="ABC1D23"
        />
      </label>

      <Combobox
        label="Marca"
        items={brands}
        selectedId={value.brandId}
        otherValue={value.brandOther}
        onPick={(id) =>
          onChange({ ...value, brandId: id, brandOther: null, modelId: null, modelOther: null })
        }
        onPickOther={() =>
          // Marca "Outro" libera o modelo como texto livre (§3.3).
          onChange({ ...value, brandId: null, brandOther: '', modelId: null, modelOther: '' })
        }
        onOtherChange={(text) => onChange({ ...value, brandOther: text })}
        onClear={() =>
          onChange({ ...value, brandId: null, brandOther: null, modelId: null, modelOther: null })
        }
      />

      <Combobox
        label="Modelo"
        items={models}
        selectedId={value.modelId}
        otherValue={value.modelOther}
        disabled={modelDisabled}
        disabledHint="selecione a marca"
        onPick={(id) => onChange({ ...value, modelId: id, modelOther: null })}
        onPickOther={() => onChange({ ...value, modelId: null, modelOther: '' })}
        onOtherChange={(text) => onChange({ ...value, modelOther: text })}
        onClear={() => onChange({ ...value, modelId: null, modelOther: null })}
      />
    </div>
  );
}

export function sameVehicle(a: VehicleDraft, b: VehicleDraft): boolean {
  return (
    a.plate.trim() === b.plate.trim() &&
    a.brandId === b.brandId &&
    (a.brandOther ?? '') === (b.brandOther ?? '') &&
    a.modelId === b.modelId &&
    (a.modelOther ?? '') === (b.modelOther ?? '')
  );
}
