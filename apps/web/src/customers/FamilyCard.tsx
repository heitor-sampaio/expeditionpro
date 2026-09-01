import { useState } from 'react';
import { CompanionForm } from './CompanionForm.js';
import { VehicleForm } from './VehicleForm.js';
import type { CustomerDto, FamilyDto } from './useCustomerSearch.js';

/**
 * Cartão de uma família: responsável no topo, acompanhantes em cartão pequeno
 * (padrão "Clientes e famílias" do design system), e a ação de adicionar
 * acompanhante no próprio fluxo (CL-03).
 */
export function FamilyCard({
  family,
  onChanged,
  onOpenFile,
}: {
  family: FamilyDto;
  onChanged: () => void;
  onOpenFile: (customerId: string) => void;
}): React.JSX.Element {
  const [adding, setAdding] = useState(false);
  const [addingVehicle, setAddingVehicle] = useState(false);

  return (
    <div className="family">
      <div className="family-head">
        <span className="avatar">{initials(family.responsible.fullName)}</span>
        <button
          type="button"
          className="result-grow result-open"
          onClick={() => onOpenFile(family.responsible.id)}
          aria-label={`Abrir ficha de ${family.responsible.fullName}`}
        >
          <span className="result-name">{family.responsible.fullName}</span>
          <span className="result-sub">{family.responsible.cpf}</span>
        </button>
        <span className="pill pill-neutral">Responsável</span>
      </div>

      {family.companions.length > 0 ? (
        <div className="members">
          {family.companions.map((companion) => (
            <MemberCard key={companion.id} member={companion} onOpenFile={onOpenFile} />
          ))}
        </div>
      ) : (
        <p className="members-empty">Sem acompanhantes nesta família.</p>
      )}

      {adding ? (
        <CompanionForm
          responsibleId={family.responsible.id}
          onCancel={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            onChanged();
          }}
        />
      ) : addingVehicle ? (
        <VehicleForm
          customerId={family.responsible.id}
          onCancel={() => setAddingVehicle(false)}
          onDone={() => setAddingVehicle(false)}
        />
      ) : (
        <div className="family-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setAddingVehicle(true)}
          >
            Adicionar veículo
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setAdding(true)}
          >
            Adicionar acompanhante
          </button>
        </div>
      )}
    </div>
  );
}

function MemberCard({
  member,
  onOpenFile,
}: {
  member: CustomerDto;
  onOpenFile: (customerId: string) => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="member member-open"
      onClick={() => onOpenFile(member.id)}
      aria-label={`Abrir ficha de ${member.fullName}`}
    >
      <span className="avatar">{initials(member.fullName)}</span>
      <span className="result-grow">
        <span className="member-name">{member.fullName}</span>
        <span className="member-cpf">{member.cpf}</span>
      </span>
    </button>
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
