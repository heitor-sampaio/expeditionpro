import { describe, expect, it } from 'vitest';
import { enderecoDoRoteiro, mensagemDoErroDeRoteiro } from './itinerarySlugField.js';

describe('RO-02: o campo de endereço do roteiro', () => {
  it('monta a prévia do link com o endereço digitado', () => {
    expect(enderecoDoRoteiro('https://app.drakkarexpedicoes.com.br', 'coxilha-rica')).toBe(
      'https://app.drakkarexpedicoes.com.br/inscricao?roteiro=coxilha-rica',
    );
  });

  it('normaliza a prévia enquanto se digita, para o campo mostrar o que vai ser salvo', () => {
    expect(enderecoDoRoteiro('https://app.x.com.br', 'Coxilha Rica • tropeiros')).toBe(
      'https://app.x.com.br/inscricao?roteiro=coxilha-rica-tropeiros',
    );
  });

  it('devolve null quando ainda não há endereço nenhum — nada a pré-visualizar', () => {
    expect(enderecoDoRoteiro('https://app.x.com.br', '')).toBeNull();
    expect(enderecoDoRoteiro('https://app.x.com.br', '•••')).toBeNull();
  });

  it('traduz o endereço ocupado, que o status sozinho não distingue de campo torto', () => {
    expect(mensagemDoErroDeRoteiro(400, 'slug_taken')).toBe(
      'Esse endereço já é de outro roteiro. Escolha outro.',
    );
    expect(mensagemDoErroDeRoteiro(400, 'invalid_slug')).toBe(
      'O endereço precisa ter ao menos uma letra ou número.',
    );
  });

  it('mantém as mensagens de hoje quando o código não é de endereço', () => {
    expect(mensagemDoErroDeRoteiro(400, 'invalid_age_bands')).toBe(
      'Confira os campos antes de salvar.',
    );
    expect(mensagemDoErroDeRoteiro(422, undefined)).toBe('Confira os campos antes de salvar.');
    expect(mensagemDoErroDeRoteiro(409, undefined)).toBe('Já existe um roteiro com esse nome.');
    expect(mensagemDoErroDeRoteiro(500, undefined)).toBe('Não foi possível salvar. Tente de novo.');
  });
});
