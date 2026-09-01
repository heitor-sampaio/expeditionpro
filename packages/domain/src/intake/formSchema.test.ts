import { describe, expect, it } from 'vitest';
import { coreFormSchema } from './formSchema.js';

/**
 * IN-24 — o `form-schema` público descreve os campos que o formulário do tenant emite,
 * com `key`, `type`, `required`. No v1 é o núcleo fixo (sem `custom_field_definitions`,
 * adiado no PRD). O acompanhante é um bloco repetível à parte.
 */
describe('IN-24: schema do formulário público', () => {
  const schema = coreFormSchema();

  it('os cinco campos do responsável são obrigatórios', () => {
    const required = schema.fields.filter((f) => f.required).map((f) => f.key);
    expect(required).toEqual([
      'resp_nome',
      'resp_cpf',
      'resp_nascimento',
      'resp_email',
      'resp_telefone',
    ]);
  });

  it('cada campo declara um tipo conhecido', () => {
    const types = new Set([
      'text',
      'cpf',
      'date',
      'email',
      'phone',
      'plate',
      'state',
      'zip',
      'consent',
    ]);
    for (const field of [...schema.fields, ...schema.companion]) {
      expect(types.has(field.type)).toBe(true);
    }
  });

  it('endereço, veículo e metadados são opcionais', () => {
    const byKey = Object.fromEntries(schema.fields.map((f) => [f.key, f]));
    for (const key of ['cep', 'estado', 'placa', 'data_desejada', 'aceite']) {
      expect(byKey[key]!.required).toBe(false);
    }
    expect(byKey['aceite']!.type).toBe('consent');
    expect(byKey['placa']!.type).toBe('plate');
  });

  it('o bloco de acompanhante é repetível: nome, cpf e nascimento', () => {
    expect(schema.companion.map((f) => f.key)).toEqual(['nome', 'cpf', 'nascimento']);
    expect(schema.companion.every((f) => f.required)).toBe(true);
  });
});
