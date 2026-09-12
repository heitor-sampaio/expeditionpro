import { Combobox } from '../ui/Combobox.js';
import { usePublicVehicleBrands, usePublicVehicleModels } from './usePublicVehicleCatalog.js';
import { escolhaVazia, type VeiculoForm } from './enrollmentForm.js';

/**
 * CL-05 · IN-25 — marca e modelo do veículo na inscrição pública, pelo catálogo.
 *
 * Eram três campos de texto livre, e texto livre produz "hilux", "Hillux" e "Toyota Hilux" —
 * três veículos onde há um, descobertos no dia do comboio. O combobox faz a inscrição chegar
 * com o nome que o catálogo já usa, e "Outro" continua ali porque catálogo nunca está
 * completo: a inscrição não pode parar por causa de um modelo que ninguém cadastrou.
 *
 * Não reusa o `VehicleFields` do back-office de propósito. Lá o que se grava é o **id** — o
 * veículo vira registro ligado ao catálogo; aqui o que viaja é o **nome**, porque o payload
 * canônico fala em texto e quem cataloga é a equipe, na alocação. Mesmo primitivo, arranjos
 * diferentes: compartilhar o arranjo obrigaria um dos dois a carregar o que não usa.
 */
export function VeiculoFields({
  value,
  onChange,
}: {
  value: VeiculoForm;
  onChange: (proximo: VeiculoForm) => void;
}): React.JSX.Element {
  const marcas = usePublicVehicleBrands();
  const modelos = usePublicVehicleModels(value.marca.id);
  const semMarca = value.marca.id === null && !value.marca.outro;

  const escolher = (itens: readonly { id: string; name: string }[], id: string) => ({
    id,
    nome: itens.find((i) => i.id === id)?.name ?? '',
    outro: false,
  });

  return (
    <div className="form-grid">
      <Combobox
        label="Marca"
        items={marcas}
        selectedId={value.marca.id}
        otherValue={value.marca.outro ? value.marca.nome : null}
        // Trocar de marca zera o modelo: o que estava escolhido era de outra cascata.
        onPick={(id) => onChange({ ...value, marca: escolher(marcas, id), modelo: escolhaVazia() })}
        onPickOther={() =>
          onChange({
            ...value,
            marca: { id: null, nome: '', outro: true },
            // Marca fora do catálogo não tem modelo dentro dele (§3.3).
            modelo: { id: null, nome: '', outro: true },
          })
        }
        onOtherChange={(texto) =>
          onChange({ ...value, marca: { id: null, nome: texto, outro: true } })
        }
        onClear={() => onChange({ ...value, marca: escolhaVazia(), modelo: escolhaVazia() })}
      />

      <Combobox
        label="Modelo"
        items={modelos}
        selectedId={value.modelo.id}
        otherValue={value.modelo.outro ? value.modelo.nome : null}
        disabled={semMarca}
        disabledHint="escolha a marca"
        onPick={(id) => onChange({ ...value, modelo: escolher(modelos, id) })}
        onPickOther={() => onChange({ ...value, modelo: { id: null, nome: '', outro: true } })}
        onOtherChange={(texto) =>
          onChange({ ...value, modelo: { id: null, nome: texto, outro: true } })
        }
        onClear={() => onChange({ ...value, modelo: escolhaVazia() })}
      />

      <label className="field">
        <span className="field-label">Placa</span>
        <input
          className="field-input is-mono"
          value={value.placa}
          onChange={(e) => onChange({ ...value, placa: e.target.value.toUpperCase() })}
          placeholder="ABC1D23"
        />
      </label>
    </div>
  );
}
