import type {
  IdentityChangeRepository,
  IdentityChangeRequestRecord,
  IdentityDecision,
  NewIdentityChangeRequest,
} from '@expedition/application';

/** Fila de identidade em memória — SÓ para dev sem banco e testes de rota. */
export function inMemoryIdentityChange(): IdentityChangeRepository {
  const rows: (IdentityChangeRequestRecord & { tenantId: string })[] = [];
  let seq = 0;

  return {
    create(request: NewIdentityChangeRequest) {
      seq += 1;
      const record: IdentityChangeRequestRecord & { tenantId: string } = {
        id: `dev-icr-${seq}`,
        tenantId: request.tenantId,
        customerId: request.customerId,
        status: 'pending',
        fullName: request.fullName,
        cpf: request.cpf,
        birthDate: request.birthDate,
        email: request.email,
        phone: request.phone,
        reason: request.reason,
        decidedBy: null,
        decisionNote: null,
        createdAt: new Date(0),
      };
      rows.push(record);
      return Promise.resolve(record);
    },
    findById(tenantId: string, id: string) {
      return Promise.resolve(rows.find((r) => r.tenantId === tenantId && r.id === id) ?? null);
    },
    listPending(tenantId: string) {
      return Promise.resolve(rows.filter((r) => r.tenantId === tenantId && r.status === 'pending'));
    },
    decide(tenantId: string, id: string, decision: IdentityDecision) {
      const index = rows.findIndex((r) => r.tenantId === tenantId && r.id === id);
      if (index === -1) return Promise.reject(new Error('not found'));
      const updated = {
        ...rows[index]!,
        status: decision.status,
        decidedBy: decision.decidedBy,
        decisionNote: decision.decisionNote,
      };
      rows[index] = updated;
      return Promise.resolve(updated);
    },
  };
}
