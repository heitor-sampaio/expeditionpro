import { useState } from 'react';
import { Combobox } from '../ui/Combobox.js';
import { plateErrorFor, topErrorFor } from './errorMessages.js';
import { useSaveVehicle, type VehiclePayload } from './useSaveVehicle.js';
import { useVehicleBrands, useVehicleModels } from './useVehicleCatalog.js';

/**
 * Veículo do cliente (CL-05): marca e modelo em combobox filtrável com "Outro",
 * cascata marca→modelo, placa validada. Componente renderiza; hooks chamam a API.
 */
export function VehicleForm({
  customerId,
  onDone,
  onCancel,
}: {
  customerId: string;
  onDone: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  const [brandId, setBrandId] = useState<string | null>(null);
  const [brandOther, setBrandOther] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [modelOther, setModelOther] = useState<string | null>(null);
  const [plate, setPlate] = useState('');

  const brands = useVehicleBrands();
  const models = useVehicleModels(brandId);
  const { state, submit } = useSaveVehicle(customerId);

  const submitting = state.status === 'submitting';
  const ready = plate.trim() !== '';
  const plateError = state.status === 'error' ? plateErrorFor(state.code) : null;
  const topError = state.status === 'error' && plateError === null ? topErrorFor(state.code) : null;
  const modelDisabled = brandId === null && brandOther === null;

  const onSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (!ready || submitting) return;
    const payload: VehiclePayload = { plate };
    if (brandId !== null) payload.brandId = brandId;
    else if (brandOther?.trim()) payload.brandOther = brandOther.trim();
    if (modelId !== null) payload.modelId = modelId;
    else if (modelOther?.trim()) payload.modelOther = modelOther.trim();
    void submit(payload).then((ok) => {
      if (ok) onDone();
    });
  };

  return (
    <form className="companion-form" onSubmit={onSubmit} noValidate>
      {topError !== null && (
        <div className="feedback feedback-error form-alert" role="alert">
          <span className="feedback-dot" />
          <span>{topError}</span>
        </div>
      )}
      <div className="form-grid">
        <Combobox
          label="Marca"
          items={brands}
          selectedId={brandId}
          otherValue={brandOther}
          onPick={(id) => {
            setBrandId(id);
            setBrandOther(null);
            setModelId(null);
            setModelOther(null);
          }}
          onPickOther={() => {
            setBrandId(null);
            setBrandOther('');
            setModelId(null);
            setModelOther(''); // marca "Outro" libera o modelo como texto livre (§3.3)
          }}
          onOtherChange={setBrandOther}
          onClear={() => {
            setBrandOther(null);
            setModelId(null);
            setModelOther(null);
          }}
        />

        <Combobox
          label="Modelo"
          items={models}
          selectedId={modelId}
          otherValue={modelOther}
          disabled={modelDisabled}
          disabledHint="selecione a marca"
          onPick={(id) => {
            setModelId(id);
            setModelOther(null);
          }}
          onPickOther={() => {
            setModelId(null);
            setModelOther('');
          }}
          onOtherChange={setModelOther}
          onClear={() => setModelOther(null)}
        />

        <div className="field">
          <label className="field-label" htmlFor="plate">
            Placa
          </label>
          <input
            id="plate"
            className={`field-input is-mono${plateError !== null ? ' has-error' : ''}`}
            value={plate}
            onChange={(event) => setPlate(event.target.value)}
            placeholder="ABC1D23"
            aria-invalid={plateError !== null}
          />
          {plateError !== null && <span className="field-error">{plateError}</span>}
        </div>
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={!ready || submitting}>
          {submitting ? 'Salvando…' : 'Salvar veículo'}
        </button>
      </div>
    </form>
  );
}
