import { acompanhanteVazio, type AcompanhanteForm, type EnrollmentForm } from './enrollmentForm.js';

/**
 * IN-25b — os campos da inscrição pública.
 *
 * Componente burro de propósito: ele não decide nada. O que pode ser enviado, o que viaja e o
 * que fica de fora é decidido em `enrollmentForm.ts`, que tem teste — aqui só há campo, rótulo
 * e o que o dedo toca.
 *
 * A ordem segue o que a pessoa sabe de cor: ela mesma, quem vai com ela, e por último o carro,
 * que é o único bloco opcional. Pedir placa antes de nome faria o formulário parecer longo
 * logo no começo, que é onde se desiste dele.
 */
export function EnrollmentFormFields({
  form,
  onChange,
}: {
  form: EnrollmentForm;
  onChange: (form: EnrollmentForm) => void;
}): React.JSX.Element {
  const set = (patch: Partial<EnrollmentForm>) => {
    onChange({ ...form, ...patch });
  };

  const setAcompanhante = (i: number, patch: Partial<AcompanhanteForm>) => {
    const lista = form.acompanhantes.map((a, j) => (i === j ? { ...a, ...patch } : a));
    set({ acompanhantes: lista });
  };

  return (
    <>
      <section className="card pub-card">
        <span className="field-label">Você</span>
        <div className="form-grid">
          <Campo
            rotulo="Nome completo"
            valor={form.nome}
            onChange={(nome) => set({ nome })}
            autoComplete="name"
          />
          <Campo
            rotulo="CPF"
            valor={form.cpf}
            onChange={(cpf) => set({ cpf })}
            inputMode="numeric"
          />
          <Campo
            rotulo="Data de nascimento"
            valor={form.nascimento}
            onChange={(nascimento) => set({ nascimento })}
            type="date"
          />
          <Campo
            rotulo="E-mail"
            valor={form.email}
            onChange={(email) => set({ email })}
            type="email"
            autoComplete="email"
          />
          <Campo
            rotulo="Telefone"
            valor={form.telefone}
            onChange={(telefone) => set({ telefone })}
            inputMode="tel"
            autoComplete="tel"
          />
        </div>
      </section>

      <section className="card pub-card">
        <span className="field-label">Quem vai com você</span>
        {form.acompanhantes.length === 0 && (
          <span className="field-help">
            Vai sozinho? Siga em frente. Cada pessoa precisa de nome, CPF e nascimento — é o que
            define o valor de cada uma.
          </span>
        )}

        {form.acompanhantes.map((acompanhante, i) => (
          <div key={i} className="pub-acomp">
            <div className="form-grid">
              <Campo
                rotulo={`Nome da ${String(i + 1)}ª pessoa`}
                valor={acompanhante.nome}
                onChange={(nome) => setAcompanhante(i, { nome })}
              />
              <Campo
                rotulo="CPF"
                valor={acompanhante.cpf}
                onChange={(cpf) => setAcompanhante(i, { cpf })}
                inputMode="numeric"
              />
              <Campo
                rotulo="Data de nascimento"
                valor={acompanhante.nascimento}
                onChange={(nascimento) => setAcompanhante(i, { nascimento })}
                type="date"
              />
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => set({ acompanhantes: form.acompanhantes.filter((_, j) => j !== i) })}
            >
              Tirar esta pessoa
            </button>
          </div>
        ))}

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => set({ acompanhantes: [...form.acompanhantes, acompanhanteVazio()] })}
        >
          Acrescentar pessoa
        </button>
      </section>

      <section className="card pub-card">
        <span className="field-label">Seu veículo</span>
        <span className="field-help">Opcional — dá para completar depois com a equipe.</span>
        <div className="form-grid">
          <Campo rotulo="Marca" valor={form.marca} onChange={(marca) => set({ marca })} />
          <Campo rotulo="Modelo" valor={form.modelo} onChange={(modelo) => set({ modelo })} />
          <Campo rotulo="Placa" valor={form.placa} onChange={(placa) => set({ placa })} />
        </div>
      </section>
    </>
  );
}

function Campo({
  rotulo,
  valor,
  onChange,
  type = 'text',
  inputMode,
  autoComplete,
}: {
  rotulo: string;
  valor: string;
  onChange: (valor: string) => void;
  type?: string;
  inputMode?: 'numeric' | 'tel';
  autoComplete?: string;
}): React.JSX.Element {
  return (
    <label className="field">
      <span className="field-label">{rotulo}</span>
      <input
        className="field-input"
        type={type}
        value={valor}
        inputMode={inputMode}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
