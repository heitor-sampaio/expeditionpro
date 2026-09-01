import { useEffect, useState } from 'react';
import { brDateToIso } from './dateFields.js';
import { AddressFields, EMPTY_ADDRESS_DRAFT, type AddressDraft } from './AddressFields.js';
import { CompanionForm } from './CompanionForm.js';
import { EMPTY_VEHICLE_DRAFT, sameVehicle, type VehicleDraft } from './VehicleFields.js';
import { MemberFields, VehicleBlock, type MemberDraft } from './FamilyEditorFields.js';
import { useCustomerFamily, type FamilyEditPatch, type SaveResult } from './useCustomerFamily.js';
import { useFamilyVehicles, type VehicleDto } from './useFamilyVehicles.js';
import type { CustomerDto } from './useCustomerSearch.js';

/**
 * Edição dos dados da família no back-office (CL-06). Mesmo cartão do "Meus dados" do
 * portal — membros, acompanhante novo, veículo da família e um "Salvar" no fim — só que
 * aqui **tudo** é editável, CPF e nascimento inclusive: a equipe é o caminho autoritário
 * (pelo portal o cliente pede, PC-07).
 *
 * Zero regra aqui: o que é permitido e o que colide vem do servidor, campo por campo.
 */

export function FamilyEditor({
  customerId,
  onSaved,
}: {
  readonly customerId: string;
  readonly onSaved: () => void;
}): React.JSX.Element {
  const { state, saving, save, remove, refresh } = useCustomerFamily(customerId);

  if (state.status === 'loading') {
    return (
      <div className="skeleton" aria-hidden>
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="skel-card">
            <div className="skel-avatar" />
            <div className="skel-bars">
              <div className="skel-bar" />
              <div className="skel-bar short" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (state.status === 'forbidden') {
    return (
      <div className="state" role="status">
        <div className="state-text">
          <span className="state-title">Sem permissão para editar</span>
          <span className="state-line">Peça a um owner ou admin do tenant.</span>
        </div>
        <div className="state-grow" />
        <button type="button" className="btn btn-primary" disabled>
          Salvar
        </button>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="state" role="alert">
        <div className="state-text">
          <span className="state-title">Não deu para carregar os dados</span>
          <span className="state-line is-error">Verifique a conexão e tente de novo.</span>
        </div>
        <div className="state-grow" />
        <button type="button" className="btn btn-secondary" onClick={refresh}>
          Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <EditorForm
      responsible={state.responsible}
      companions={state.companions}
      saving={saving}
      save={save}
      remove={remove}
      onSaved={() => {
        refresh();
        onSaved();
      }}
    />
  );
}

function EditorForm({
  responsible,
  companions,
  saving,
  save,
  remove,
  onSaved,
}: {
  responsible: CustomerDto;
  companions: CustomerDto[];
  saving: boolean;
  save: (id: string, patch: FamilyEditPatch) => Promise<SaveResult>;
  remove: (id: string) => Promise<SaveResult>;
  onSaved: () => void;
}): React.JSX.Element {
  const members = [responsible, ...companions];
  const memberKey = members.map((m) => m.id).join(',');
  const vehicles = useFamilyVehicles(responsible.id);

  const [drafts, setDrafts] = useState<Record<string, MemberDraft>>(() => initialDrafts(members));
  const [address, setAddress] = useState<AddressDraft>(() => toAddressDraft(responsible));
  const [cars, setCars] = useState<Record<string, VehicleDraft>>({});
  const [newCar, setNewCar] = useState<VehicleDraft>(EMPTY_VEHICLE_DRAFT);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<CustomerDto | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'go' | 'no'; text: string } | null>(null);

  // A família pode mudar embaixo do form (acompanhante novo, merge, vínculo): quando a
  // lista muda, o rascunho volta a ancorar no dado do servidor.
  useEffect(() => {
    setDrafts(initialDrafts(members));
    setAddress(toAddressDraft(responsible));
    // Depende de memberKey de propósito: reancorar a cada render apagaria o que está
    // sendo digitado.
  }, [memberKey]);

  useEffect(() => {
    if (vehicles.vehicles) setCars(initialCars(vehicles.vehicles));
  }, [vehicles.vehicles]);

  const draftOf = (member: CustomerDto): MemberDraft => drafts[member.id] ?? toDraft(member);
  const setField = (member: CustomerDto, field: keyof MemberDraft, value: string) =>
    setDrafts((prev) => ({ ...prev, [member.id]: { ...draftOf(member), [field]: value } }));

  const carOf = (vehicle: VehicleDto): VehicleDraft => cars[vehicle.id] ?? toCarDraft(vehicle);
  const setCar = (vehicleId: string, next: VehicleDraft) =>
    setCars((prev) => ({ ...prev, [vehicleId]: next }));

  // Só o que mudou vai no PATCH — campo ausente preserva o valor no servidor.
  const patchFor = (member: CustomerDto): FamilyEditPatch | null => {
    const draft = draftOf(member);
    const original = toDraft(member);
    const patch: FamilyEditPatch = {};
    if (draft.fullName.trim() !== original.fullName) patch.fullName = draft.fullName.trim();
    if (draft.cpf.trim() !== original.cpf) patch.cpf = draft.cpf.trim();
    if (draft.birthDate !== original.birthDate && draft.birthDate !== '') {
      patch.birthDate = draft.birthDate;
    }
    if (draft.email.trim() !== original.email) patch.email = draft.email.trim();
    if (draft.phone.trim() !== original.phone) patch.phone = draft.phone.trim();
    if (member.id === responsible.id && addressChanged(address, responsible)) {
      patch.address = address;
    }
    return Object.keys(patch).length > 0 ? patch : null;
  };

  const changedCars = (vehicles.vehicles ?? []).filter(
    (vehicle) => !sameVehicle(carOf(vehicle), toCarDraft(vehicle)),
  );
  const newCarFilled = newCar.plate.trim() !== '';
  const dirty = members.some((m) => patchFor(m) !== null) || changedCars.length > 0 || newCarFilled;

  const confirmRemove = async () => {
    if (!removing) return;
    const result = await remove(removing.id);
    setRemoving(null);
    if (!result.ok) {
      setFeedback({ kind: 'no', text: `${removing.fullName}: ${result.message}` });
      return;
    }
    setFeedback({ kind: 'go', text: `${removing.fullName} foi removido da família.` });
    onSaved();
  };

  const submit = async () => {
    setFeedback(null);
    for (const member of members) {
      const patch = patchFor(member);
      if (!patch) continue;
      const result = await save(member.id, patch);
      if (!result.ok) {
        setFeedback({ kind: 'no', text: `${member.fullName}: ${result.message}` });
        return;
      }
    }
    for (const vehicle of changedCars) {
      const result = await vehicles.update(vehicle.id, carOf(vehicle));
      if (!result.ok) {
        setFeedback({ kind: 'no', text: `Veículo ${vehicle.plate}: ${result.message}` });
        return;
      }
    }
    if (newCarFilled) {
      const result = await vehicles.create(responsible.id, newCar);
      if (!result.ok) {
        setFeedback({ kind: 'no', text: `Veículo novo: ${result.message}` });
        return;
      }
      setNewCar(EMPTY_VEHICLE_DRAFT);
    }
    vehicles.refresh();
    setFeedback({ kind: 'go', text: 'Dados salvos.' });
    onSaved();
  };

  return (
    <div className="card">
      <div className="panel-head">
        <h2 className="card-title">Dados da família</h2>
      </div>

      {feedback && (
        <div
          className={`feedback ${feedback.kind === 'go' ? 'feedback-go' : 'feedback-error'}`}
          role={feedback.kind === 'go' ? 'status' : 'alert'}
        >
          <span className="feedback-dot" />
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="member-editors">
        {members.map((member) => (
          <MemberFields
            key={member.id}
            member={member}
            isResponsible={member.id === responsible.id}
            draft={draftOf(member)}
            onChange={(field, value) => setField(member, field, value)}
            onRemove={member.id === responsible.id ? undefined : () => setRemoving(member)}
          />
        ))}
      </div>

      {adding ? (
        <div className="member-editor">
          <CompanionForm
            responsibleId={responsible.id}
            onCancel={() => setAdding(false)}
            onDone={() => {
              setAdding(false);
              onSaved();
            }}
          />
        </div>
      ) : (
        <div className="form-actions">
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            Adicionar acompanhante
          </button>
        </div>
      )}

      <VehicleBlock
        vehicles={vehicles.vehicles}
        carOf={carOf}
        onChangeCar={setCar}
        newCar={newCar}
        onChangeNewCar={setNewCar}
      />

      <span className="field-label form-subhead">Endereço fiscal do responsável</span>
      <AddressFields value={address} onChange={setAddress} />

      <p className="field-help">
        Nome, CPF e nascimento são identidade: alterar exige owner ou admin. O responsável não fica
        sem e-mail nem sem telefone.
      </p>

      <div className="form-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving || !dirty}
          onClick={() => void submit()}
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>

      {removing && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Remover acompanhante">
          <div className="modal">
            <h2 className="modal-title">Remover {removing.fullName}?</h2>
            <p className="modal-sub">
              O cadastro sai da família e não dá para desfazer. Quem já participou de uma saída não
              pode ser removido — o histórico fica.
            </p>
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={saving}
                onClick={() => setRemoving(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                onClick={() => void confirmRemove()}
              >
                {saving ? 'Removendo…' : 'Remover'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function initialDrafts(members: CustomerDto[]): Record<string, MemberDraft> {
  return Object.fromEntries(members.map((m) => [m.id, toDraft(m)]));
}

function toDraft(member: CustomerDto): MemberDraft {
  return {
    fullName: member.fullName,
    cpf: member.cpf,
    birthDate: brDateToIso(member.birthDate),
    email: member.email ?? '',
    phone: member.phone ?? '',
  };
}

function initialCars(vehicles: VehicleDto[]): Record<string, VehicleDraft> {
  return Object.fromEntries(vehicles.map((v) => [v.id, toCarDraft(v)]));
}

function toCarDraft(vehicle: VehicleDto): VehicleDraft {
  return {
    plate: vehicle.plate,
    brandId: vehicle.brandId,
    brandOther: vehicle.brandOther,
    modelId: vehicle.modelId,
    modelOther: vehicle.modelOther,
  };
}

function toAddressDraft(member: CustomerDto): AddressDraft {
  const address = member.address;
  if (!address) return EMPTY_ADDRESS_DRAFT;
  return {
    zip: address.zip ?? '',
    street: address.street ?? '',
    number: address.number ?? '',
    district: address.district ?? '',
    city: address.city ?? '',
    state: address.state ?? '',
  };
}

/** Compara com o que veio do servidor: sem mudança, o endereço não entra no PATCH. */
function addressChanged(draft: AddressDraft, responsible: CustomerDto): boolean {
  const original = toAddressDraft(responsible);
  return (Object.keys(original) as (keyof AddressDraft)[]).some(
    (field) => draft[field].trim() !== original[field],
  );
}
