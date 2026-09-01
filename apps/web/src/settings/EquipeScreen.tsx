import { useEffect, useState } from 'react';
import { useCrew, type CrewCompanion } from './useCrew.js';

/**
 * CF-05 — Configurações → Equipe: o condutor da empresa, que abre a roomlist (GR-15) e a
 * lista do comboio (GR-17).
 *
 * Não é cliente — não tem inscrição, não paga, não gera cashback —, por isso vive aqui e
 * não no cadastro de clientes. Só render e chamada; a validação é toda do servidor.
 */
export function EquipeScreen(): React.JSX.Element {
  const { state, busy, refresh, save } = useCrew();
  const [form, setForm] = useState({
    fullName: '',
    cpf: '',
    birthDate: '',
    email: '',
    phone: '',
    street: '',
    number: '',
    district: '',
    city: '',
    stateUf: '',
    zip: '',
    brand: '',
    model: '',
    plate: '',
  });
  const [companions, setCompanions] = useState<CrewCompanion[]>([]);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (state.status !== 'ready') return;
    const lead = state.lead;
    setForm({
      fullName: lead?.fullName ?? '',
      cpf: lead?.cpf ?? '',
      birthDate: lead?.birthDate ?? '',
      email: lead?.email ?? '',
      phone: lead?.phone ?? '',
      street: lead?.address.street ?? '',
      number: lead?.address.number ?? '',
      district: lead?.address.district ?? '',
      city: lead?.address.city ?? '',
      stateUf: lead?.address.state ?? '',
      zip: lead?.address.zip ?? '',
      brand: lead?.vehicle?.brand ?? '',
      model: lead?.vehicle?.model ?? '',
      plate: lead?.vehicle?.plate ?? '',
    });
    setCompanions(lead?.companions ?? []);
  }, [state]);

  const set = (field: keyof typeof form, value: string) => {
    setFeedback(null);
    setForm((current) => ({ ...current, [field]: value }));
  };

  const onSave = async () => {
    // Os três campos do veículo andam juntos: vazio limpa, preenchido vai inteiro.
    const vehicleFields = [form.brand, form.model, form.plate].filter((f) => f.trim() !== '');
    if (vehicleFields.length > 0 && vehicleFields.length < 3) {
      setFeedback({ ok: false, text: 'Preencha marca, modelo e placa — ou deixe os três vazios.' });
      return;
    }

    const result = await save({
      fullName: form.fullName,
      cpf: form.cpf,
      birthDate: form.birthDate,
      email: form.email.trim() === '' ? null : form.email,
      phone: form.phone.trim() === '' ? null : form.phone,
      address: {
        street: form.street,
        number: form.number,
        district: form.district,
        city: form.city,
        state: form.stateUf,
        zip: form.zip,
      },
      vehicle:
        vehicleFields.length === 3
          ? { brand: form.brand, model: form.model, plate: form.plate }
          : null,
      companions: companions.filter((companion) => companion.fullName.trim() !== ''),
    });

    setFeedback(
      result.ok ? { ok: true, text: 'Dados salvos.' } : { ok: false, text: result.message },
    );
  };

  const valid = form.fullName.trim() !== '' && form.cpf.trim() !== '' && form.birthDate !== '';

  return (
    <main className="page page-wide">
      <div className="page-header">
        <h1 className="page-title">Equipe</h1>
        <p className="page-meta">
          O condutor da empresa — quem abre a roomlist e a lista do comboio.
        </p>
      </div>

      <section className="card">
        <div className="panel-head">
          <h2 className="card-title">Condutor</h2>
        </div>

        {state.status === 'loading' && <p className="members-empty">Carregando dados…</p>}

        {state.status === 'error' && (
          <div className="state" role="alert">
            <div className="state-text">
              <span className="state-title">Não deu para carregar a equipe</span>
              <span className="state-line is-error">Tente de novo.</span>
            </div>
            <div className="state-grow" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>
              Tentar de novo
            </button>
          </div>
        )}

        {state.status === 'forbidden' && (
          <div className="state">
            <div className="state-text">
              <span className="state-title">Sem acesso à equipe</span>
              <span className="state-line">Peça a um owner ou admin do tenant.</span>
            </div>
            <div className="state-grow" />
            <button type="button" className="btn btn-secondary btn-sm" disabled>
              Salvar
            </button>
          </div>
        )}

        {state.status === 'ready' && (
          <>
            {feedback && (
              <div className={`feedback ${feedback.ok ? 'feedback-go' : 'feedback-error'}`}>
                <span className="feedback-dot" />
                <span>{feedback.text}</span>
              </div>
            )}

            <div className="form-grid">
              <label className="field field-full">
                <span className="field-label">Nome completo</span>
                <input
                  className="field-input"
                  value={form.fullName}
                  onChange={(event) => set('fullName', event.target.value)}
                />
              </label>
              <label className="field">
                <span className="field-label">CPF</span>
                <input
                  className="field-input is-mono"
                  inputMode="numeric"
                  value={form.cpf}
                  onChange={(event) => set('cpf', event.target.value)}
                  placeholder="000.000.000-00"
                />
              </label>
              <label className="field">
                <span className="field-label">Nascimento</span>
                <input
                  type="date"
                  className="field-input is-mono"
                  value={form.birthDate}
                  onChange={(event) => set('birthDate', event.target.value)}
                />
              </label>
              <label className="field">
                <span className="field-label">E-mail</span>
                <input
                  className="field-input"
                  value={form.email}
                  onChange={(event) => set('email', event.target.value)}
                />
              </label>
              <label className="field">
                <span className="field-label">Telefone</span>
                <input
                  className="field-input is-mono"
                  value={form.phone}
                  onChange={(event) => set('phone', event.target.value)}
                  placeholder="(48) 99999-9999"
                />
              </label>
            </div>

            <div className="panel-head panel-head-inner">
              <h2 className="card-title">Endereço</h2>
            </div>
            <div className="form-grid">
              <label className="field">
                <span className="field-label">CEP</span>
                <input
                  className="field-input is-mono"
                  value={form.zip}
                  onChange={(event) => set('zip', event.target.value)}
                  placeholder="00000-000"
                />
              </label>
              <label className="field">
                <span className="field-label">Rua</span>
                <input
                  className="field-input"
                  value={form.street}
                  onChange={(event) => set('street', event.target.value)}
                />
              </label>
              <label className="field">
                <span className="field-label">Número</span>
                <input
                  className="field-input"
                  value={form.number}
                  onChange={(event) => set('number', event.target.value)}
                />
              </label>
              <label className="field">
                <span className="field-label">Bairro</span>
                <input
                  className="field-input"
                  value={form.district}
                  onChange={(event) => set('district', event.target.value)}
                />
              </label>
              <label className="field">
                <span className="field-label">Cidade</span>
                <input
                  className="field-input"
                  value={form.city}
                  onChange={(event) => set('city', event.target.value)}
                />
              </label>
              <label className="field">
                <span className="field-label">UF</span>
                <input
                  className="field-input is-mono"
                  maxLength={2}
                  value={form.stateUf}
                  onChange={(event) => set('stateUf', event.target.value.toUpperCase())}
                />
              </label>
            </div>

            <div className="panel-head panel-head-inner">
              <h2 className="card-title">Veículo</h2>
            </div>
            <p className="field-help">
              Abre a lista do comboio. Deixe em branco se o seu carro não entra na lista.
            </p>
            <div className="form-grid">
              <label className="field">
                <span className="field-label">Marca</span>
                <input
                  className="field-input"
                  value={form.brand}
                  onChange={(event) => set('brand', event.target.value)}
                  placeholder="Ford"
                />
              </label>
              <label className="field">
                <span className="field-label">Modelo</span>
                <input
                  className="field-input"
                  value={form.model}
                  onChange={(event) => set('model', event.target.value)}
                  placeholder="Ranger"
                />
              </label>
              <label className="field">
                <span className="field-label">Placa</span>
                <input
                  className="field-input is-mono"
                  value={form.plate}
                  onChange={(event) => set('plate', event.target.value.toUpperCase())}
                  placeholder="ABC1D23"
                />
              </label>
            </div>

            <div className="panel-head panel-head-inner">
              <h2 className="card-title">Acompanhantes</h2>
            </div>
            <p className="field-help">
              Quem viaja com você. Entram na roomlist com nome e nascimento.
            </p>

            {companions.length === 0 && (
              <p className="members-empty">Nenhum acompanhante cadastrado.</p>
            )}

            {companions.map((companion, index) => (
              <div key={index} className="form-grid">
                <label className="field">
                  <span className="field-label">Nome</span>
                  <input
                    className="field-input"
                    value={companion.fullName}
                    onChange={(event) =>
                      setCompanions((list) =>
                        list.map((item, position) =>
                          position === index ? { ...item, fullName: event.target.value } : item,
                        ),
                      )
                    }
                  />
                </label>
                <label className="field">
                  <span className="field-label">Nascimento</span>
                  <input
                    type="date"
                    className="field-input is-mono"
                    value={companion.birthDate}
                    onChange={(event) =>
                      setCompanions((list) =>
                        list.map((item, position) =>
                          position === index ? { ...item, birthDate: event.target.value } : item,
                        ),
                      )
                    }
                  />
                </label>
                <div className="field">
                  <span className="field-label">&nbsp;</span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                      setCompanions((list) => list.filter((_, position) => position !== index))
                    }
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}

            <div className="form-actions-left">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setCompanions((list) => [...list, { fullName: '', birthDate: '' }])}
              >
                Adicionar acompanhante
              </button>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !valid}
                onClick={() => void onSave()}
              >
                {busy ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
