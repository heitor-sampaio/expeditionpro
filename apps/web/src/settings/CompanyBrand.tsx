import { useEffect } from 'react';
import { api } from '../auth/api.js';
import { companyStore, initials } from './companyStore.js';
import { useCompanyValue } from './useCompany.js';

/**
 * CF-02 — a marca no topo da navegação. Com logo, a imagem; sem logo, as iniciais no
 * quadrado do accent, como o sistema sempre mostrou.
 *
 * A busca acontece aqui porque a marca é o primeiro lugar do app que precisa do dado —
 * e o resultado vai para o store, então a aba Empresa já abre preenchida.
 */
export function CompanyBrand(): React.JSX.Element {
  const company = useCompanyValue();

  useEffect(() => {
    if (companyStore.snapshot() !== null) return;
    const controller = new AbortController();
    api('/v1/company', { signal: controller.signal })
      .then(async (res) => {
        if (res.ok) companyStore.set(await res.json());
      })
      .catch(() => {
        // A marca é enfeite: sem ela o menu continua inteiro, com as iniciais.
      });
    return () => controller.abort();
  }, []);

  const name = company?.name ?? 'ExpeditionPRO';

  return (
    <div className="brand">
      {company?.logo ? (
        <img className="brand-logo" src={company.logo} alt={name} />
      ) : (
        <span className="brand-mark">{initials(name)}</span>
      )}
      <div className="brand-id">
        <div className="brand-name">{name}</div>
        <div className="brand-sub">ExpeditionPRO</div>
      </div>
    </div>
  );
}
