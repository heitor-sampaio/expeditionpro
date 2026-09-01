/**
 * IN-24 — descrição pública dos campos do formulário do tenant (`GET /form-schema`).
 * Para uma integração montar seu próprio formulário. No v1 é o **núcleo fixo** que o
 * perfil `wp_flat_v1` espera; quando existir `custom_field_definitions` (§5.6.1, adiado),
 * os extras do tenant entram por cima. Sem dado de cliente — leitura pública.
 */

export type FormFieldType =
  'text' | 'cpf' | 'date' | 'email' | 'phone' | 'plate' | 'state' | 'zip' | 'consent';

export interface FormFieldDef {
  readonly key: string;
  readonly type: FormFieldType;
  readonly required: boolean;
}

export interface FormSchema {
  readonly fields: readonly FormFieldDef[];
  /** Bloco repetível por acompanhante — na origem, as chaves viram `acomp_{n}_{key}`. */
  readonly companion: readonly FormFieldDef[];
}

const FIELDS: readonly FormFieldDef[] = [
  { key: 'resp_nome', type: 'text', required: true },
  { key: 'resp_cpf', type: 'cpf', required: true },
  { key: 'resp_nascimento', type: 'date', required: true },
  { key: 'resp_email', type: 'email', required: true },
  { key: 'resp_telefone', type: 'phone', required: true },
  { key: 'cep', type: 'zip', required: false },
  { key: 'endereco', type: 'text', required: false },
  { key: 'numero', type: 'text', required: false },
  { key: 'bairro', type: 'text', required: false },
  { key: 'cidade', type: 'text', required: false },
  { key: 'estado', type: 'state', required: false },
  { key: 'marca', type: 'text', required: false },
  { key: 'modelo', type: 'text', required: false },
  { key: 'placa', type: 'plate', required: false },
  { key: 'data_desejada', type: 'date', required: false },
  { key: 'aceite', type: 'consent', required: false },
];

const COMPANION: readonly FormFieldDef[] = [
  { key: 'nome', type: 'text', required: true },
  { key: 'cpf', type: 'cpf', required: true },
  { key: 'nascimento', type: 'date', required: true },
];

export function coreFormSchema(): FormSchema {
  return { fields: FIELDS, companion: COMPANION };
}
