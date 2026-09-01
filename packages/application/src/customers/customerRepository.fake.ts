import type { Cpf } from '@expedition/domain';
import type {
  CustomerRecord,
  CustomerRepository,
  CustomerSort,
  NewCustomer,
} from './customerRepository.js';

/**
 * Fake in-memory do port, para os testes de casos de uso. NÃO é mock de Prisma —
 * é um duplo na fronteira da aplicação. Constraints, triggers e a busca SQL real
 * são cobertos pelo teste de integração contra Postgres, não aqui.
 *
 * Excluído do build (`*.fake.ts`); serve só aos testes.
 */
export function fakeCustomerRepository(): CustomerRepository & { rows: CustomerRecord[] } {
  const rows: CustomerRecord[] = [];
  let seq = 0;

  const norm = (value: string): string => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // 'name' → A→Z; 'created' → mais recente primeiro (o array preserva a ordem de inserção).
  const ordered = (list: CustomerRecord[], sort: CustomerSort): CustomerRecord[] =>
    sort === 'created'
      ? [...list].reverse()
      : [...list].sort((a, b) => norm(a.fullName).localeCompare(norm(b.fullName)));

  return {
    rows,
    findByCpf(tenantId: string, cpf: Cpf) {
      return Promise.resolve(rows.find((r) => r.tenantId === tenantId && r.cpf === cpf) ?? null);
    },
    findById(tenantId: string, id: string) {
      return Promise.resolve(rows.find((r) => r.tenantId === tenantId && r.id === id) ?? null);
    },
    listByResponsible(tenantId: string, responsibleId: string) {
      return Promise.resolve(
        rows.filter((r) => r.tenantId === tenantId && r.responsibleId === responsibleId),
      );
    },
    listByIds(tenantId: string, ids: readonly string[]) {
      const wanted = new Set(ids);
      return Promise.resolve(rows.filter((r) => r.tenantId === tenantId && wanted.has(r.id)));
    },
    search(tenantId: string, query: string, sort: CustomerSort) {
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
    listResponsibles(tenantId: string, sort: CustomerSort) {
      const heads = rows.filter((r) => r.tenantId === tenantId && r.responsibleId === null);
      return Promise.resolve(ordered(heads, sort));
    },
    create(data: NewCustomer) {
      seq += 1;
      const record: CustomerRecord = { ...data, id: `cust-${seq}` };
      rows.push(record);
      return Promise.resolve(record);
    },
    updateResponsible(tenantId: string, customerId: string, responsibleId: string | null) {
      const index = rows.findIndex((r) => r.tenantId === tenantId && r.id === customerId);
      if (index === -1) return Promise.reject(new Error('not found'));
      const updated: CustomerRecord = { ...rows[index]!, responsibleId };
      rows[index] = updated;
      return Promise.resolve(updated);
    },
    updateContact(
      tenantId: string,
      customerId: string,
      contact: { email: string | null; phone: string | null; address: CustomerRecord['address'] },
    ) {
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
    updateProfile(
      tenantId: string,
      customerId: string,
      profile: {
        fullName: string;
        cpf: CustomerRecord['cpf'];
        birthDate: CustomerRecord['birthDate'];
        email: string | null;
        phone: string | null;
        address: CustomerRecord['address'];
      },
    ) {
      const index = rows.findIndex((r) => r.tenantId === tenantId && r.id === customerId);
      if (index === -1) return Promise.reject(new Error('not found'));
      const updated: CustomerRecord = { ...rows[index]!, ...profile };
      rows[index] = updated;
      return Promise.resolve(updated);
    },
    updateContactInfo(
      tenantId: string,
      customerId: string,
      contact: { email?: string; phone?: string },
    ) {
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
    updateIdentity(
      tenantId: string,
      customerId: string,
      identity: {
        fullName?: string;
        cpf?: CustomerRecord['cpf'];
        birthDate?: CustomerRecord['birthDate'];
      },
    ) {
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
    linkAuthUser(tenantId: string, customerId: string, authUserId: string, portalStatus: string) {
      void tenantId;
      void customerId;
      void authUserId;
      void portalStatus;
      return Promise.resolve();
    },
    reassignDependents(tenantId: string, fromResponsibleId: string, toResponsibleId: string) {
      rows.forEach((r, i) => {
        if (r.tenantId === tenantId && r.responsibleId === fromResponsibleId) {
          rows[i] = { ...r, responsibleId: toResponsibleId };
        }
      });
      return Promise.resolve();
    },
    deleteCustomer(tenantId: string, customerId: string) {
      const index = rows.findIndex((r) => r.tenantId === tenantId && r.id === customerId);
      if (index !== -1) rows.splice(index, 1);
      return Promise.resolve();
    },
  };
}
