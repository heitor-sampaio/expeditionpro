/**
 * Traduz o código de erro do servidor para mensagem de campo ou de topo.
 * Erro diz o que aconteceu e o que fazer, em uma frase (design system §8).
 */

export function cpfErrorFor(code: string): string | null {
  if (code === 'invalid_cpf') return 'CPF inválido — confira os dígitos.';
  if (code === 'duplicate_cpf') return 'Este CPF já está cadastrado neste tenant.';
  return null;
}

export function plateErrorFor(code: string): string | null {
  if (code === 'invalid_plate') return 'Placa inválida — use ABC1234 ou ABC1D23.';
  return null;
}

export function topErrorFor(code: string): string {
  switch (code) {
    case 'required_field':
      return 'Preencha nome, CPF, nascimento, e-mail e telefone.';
    case 'invalid_birth_date':
      return 'Data de nascimento inválida.';
    case 'companion_limit':
      return 'Esta família já atingiu o limite de acompanhantes.';
    case 'not_a_responsible':
      return 'Não é possível adicionar acompanhante a um acompanhante.';
    case 'not_found':
      return 'Registro não encontrado.';
    case 'model_brand_mismatch':
      return 'O modelo não pertence à marca escolhida.';
    case 'network':
      return 'Sem conexão com o servidor. Tente de novo.';
    default:
      return 'Não foi possível salvar. Tente de novo.';
  }
}
