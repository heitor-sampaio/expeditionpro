import { VehicleFields, type VehicleDraft } from './VehicleFields.js';
import type { VehicleDto } from './useFamilyVehicles.js';
import type { CustomerDto } from './useCustomerSearch.js';

/**
 * Os blocos do editor da família (CL-06): os campos de um membro e o bloco de veículos.
 * Só renderizam — o estado e o salvamento ficam no `FamilyEditor`.
 */

export interface MemberDraft {
  fullName: string;
  cpf: string;
  birthDate: string;
  email: string;
  phone: string;
}

export function MemberFields({
  member,
  isResponsible,
  draft,
  onChange,
  onRemove,
}: {
  readonly member: CustomerDto;
  readonly isResponsible: boolean;
  readonly draft: MemberDraft;
  readonly onChange: (field: keyof MemberDraft, value: string) => void;
  /** Só acompanhante é removível (CL-03); ausente no responsável. */
  readonly onRemove?: (() => void) | undefined;
}): React.JSX.Element {
  return (
    <div className="member-editor">
      <div className="family-head">
        <span className="avatar">{initials(member.fullName)}</span>
        <span className="result-grow">
          <span className="result-name">{member.fullName}</span>
        </span>
        <span className="pill pill-neutral">{isResponsible ? 'Responsável' : 'Acompanhante'}</span>
        {onRemove && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onRemove}>
            Remover
          </button>
        )}
      </div>
      <div className="form-grid">
        <label className="field field-wide">
          <span className="field-label">Nome completo</span>
          <input
            className="field-input"
            value={draft.fullName}
            onChange={(e) => onChange('fullName', e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">CPF</span>
          <input
            className="field-input is-mono"
            value={draft.cpf}
            onChange={(e) => onChange('cpf', e.target.value)}
            inputMode="numeric"
          />
        </label>
        <label className="field">
          <span className="field-label">Nascimento</span>
          <input
            type="date"
            className="field-input is-mono"
            value={draft.birthDate}
            onChange={(e) => onChange('birthDate', e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">E-mail</span>
          <input
            className="field-input"
            value={draft.email}
            onChange={(e) => onChange('email', e.target.value)}
            inputMode="email"
          />
        </label>
        <label className="field">
          <span className="field-label">Telefone</span>
          <input
            className="field-input is-mono"
            value={draft.phone}
            onChange={(e) => onChange('phone', e.target.value)}
            inputMode="tel"
          />
        </label>
      </div>
    </div>
  );
}

/**
 * Veículos da família (CL-05): os que existem, editáveis, e um bloco em branco para
 * anexar mais um. Tudo entra no mesmo "Salvar" do cartão.
 */
export function VehicleBlock({
  vehicles,
  carOf,
  onChangeCar,
  newCar,
  onChangeNewCar,
}: {
  readonly vehicles: VehicleDto[] | null;
  readonly carOf: (vehicle: VehicleDto) => VehicleDraft;
  readonly onChangeCar: (vehicleId: string, next: VehicleDraft) => void;
  readonly newCar: VehicleDraft;
  readonly onChangeNewCar: (next: VehicleDraft) => void;
}): React.JSX.Element {
  return (
    <>
      <span className="field-label form-subhead vehicle-subhead">Veículos da família</span>

      {vehicles === null && <p className="members-empty">Carregando…</p>}

      {vehicles?.map((vehicle) => (
        <VehicleFields
          key={vehicle.id}
          value={carOf(vehicle)}
          onChange={(next) => onChangeCar(vehicle.id, next)}
        />
      ))}

      {vehicles !== null && vehicles.length === 0 && (
        <p className="members-empty">Nenhum veículo cadastrado nesta família.</p>
      )}

      <span className="field-label form-subhead">Anexar outro veículo (opcional)</span>
      <VehicleFields value={newCar} onChange={onChangeNewCar} />
    </>
  );
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}
