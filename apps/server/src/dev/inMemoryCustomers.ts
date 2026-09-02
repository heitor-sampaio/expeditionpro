import type { CustomerRecord, CustomerRepository, CustomerSort } from '@expedition/application';

/**
 * Repositório em memória — SÓ para rodar o app em dev sem banco, e para os testes
 * de rota (via inject). Não persiste e não vale como teste de integração (esses
 * usam Postgres real). Espelha a semântica do port.
 */
export function inMemoryCustomers(): CustomerRepository {
  const rows: CustomerRecord[] = [];
  let seq = 0;

  const norm = (value: string): string => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const ordered = (list: CustomerRecord[], sort: CustomerSort): CustomerRecord[] =>
    sort === 'created'
      ? [...list].reverse()
      : [...list].sort((a, b) => norm(a.fullName).localeCompare(norm(b.fullName)));

  return {
    findByCpf(tenantId, cpf) {
      return Promise.resolve(rows.find((r) => r.tenantId === tenantId && r.cpf === cpf) ?? null);
    },
    findById(tenantId, id) {
      return Promise.resolve(rows.find((r) => r.tenantId === tenantId && r.id === id) ?? null);
    },
    listByResponsible(tenantId, responsibleId) {
      return Promise.resolve(
        rows.filter((r) => r.tenantId === tenantId && r.responsibleId === responsibleId),
      );
    },
    listByIds(tenantId, ids) {
      const wanted = new Set(ids);
      return Promise.resolve(rows.filter((r) => r.tenantId === tenantId && wanted.has(r.id)));
    },
    // AT-06: telefone exato, para a chegada de mensagem casar com cliente existente.
    listByPhone(tenantId, phone) {
      return Promise.resolve(rows.filter((r) => r.tenantId === tenantId && r.phone === phone));
    },
    search(tenantId, query, sort) {
      const q = norm(query.trim());
      const digits = query.replace(/\D/g, '');
      const matched = rows.filter(
        (r) =>
          r.tenantId === tenantId &&
          ((q.length > 0 && norm(r.fullName).includes(q)) ||
            (digits.length > 0 && r.cpf.includes(digits)) ||
            (digits.length > 0 && (r.phone ?? '').replace(/\D/g, '').includes(digits))),
      );
      return Promise.resolve(ordered(matched, sort));
    },
    listResponsibles(tenantId, sort) {
      const heads = rows.filter((r) => r.tenantId === tenantId && r.responsibleId === null);
      return Promise.resolve(ordered(heads, sort));
    },
    create(data) {
      seq += 1;
      const record: CustomerRecord = { ...data, id: `dev-${seq}` };
      rows.push(record);
      return Promise.resolve(record);
    },
    updateResponsible(tenantId, customerId, responsibleId) {
      const index = rows.findIndex((r) => r.tenantId === tenantId && r.id === customerId);
      if (index === -1) return Promise.reject(new Error('not found'));
      const updated: CustomerRecord = { ...rows[index]!, responsibleId };
      rows[index] = updated;
      return Promise.resolve(updated);
    },
    updateContact(tenantId, customerId, contact) {
      const index = rows.findIndex((r) => r.tenantId === tenantId && r.id === customerId);
      if (index === -1) return Promise.reject(new Error('not found'));
      const updated: CustomerRecord = {
        ...rows[index]!,
        email: contact.email,
        phone: contact.phone,
        address: contact.address,
      };
      rows[index] = updated;
      return Promise.resolve(updated);
    },
    updateProfile(tenantId, customerId, profile) {
      const index = rows.findIndex((r) => r.tenantId === tenantId && r.id === customerId);
      if (index === -1) return Promise.reject(new Error('not found'));
      const updated: CustomerRecord = { ...rows[index]!, ...profile };
      rows[index] = updated;
      return Promise.resolve(updated);
    },
    updateIdentity(tenantId, customerId, identity) {
      const index = rows.findIndex((r) => r.tenantId === tenantId && r.id === customerId);
      if (index === -1) return Promise.reject(new Error('not found'));
      const current = rows[index]!;
      const updated: CustomerRecord = {
        ...current,
        fullName: identity.fullName ?? current.fullName,
        cpf: identity.cpf ?? current.cpf,
        birthDate: identity.birthDate ?? current.birthDate,
      };
      rows[index] = updated;
      return Promise.resolve(updated);
    },
    updateContactInfo(tenantId, customerId, contact) {
      const index = rows.findIndex((r) => r.tenantId === tenantId && r.id === customerId);
      if (index === -1) return Promise.reject(new Error('not found'));
      const current = rows[index]!;
      const updated: CustomerRecord = {
        ...current,
        email: contact.email ?? current.email,
        phone: contact.phone ?? current.phone,
      };
      rows[index] = updated;
      return Promise.resolve(updated);
    },
    linkAuthUser(tenantId, customerId, authUserId, portalStatus) {
      void tenantId;
      void customerId;
      void authUserId;
      void portalStatus;
      return Promise.resolve();
    },
    reassignDependents(tenantId, fromResponsibleId, toResponsibleId) {
      rows.forEach((r, i) => {
        if (r.tenantId === tenantId && r.responsibleId === fromResponsibleId) {
          rows[i] = { ...r, responsibleId: toResponsibleId };
        }
      });
      return Promise.resolve();
    },
    deleteCustomer(tenantId, customerId) {
      const index = rows.findIndex((r) => r.tenantId === tenantId && r.id === customerId);
      if (index !== -1) rows.splice(index, 1);
      return Promise.resolve();
    },
  };
}
