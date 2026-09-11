import { EMPTY_ADDRESS_DRAFT, type AddressDraft } from '../ui/AddressFields.js';

/**
 * IN-25b — o que a página monta, e quando ela deixa enviar.
 *
 * A tela não tem teste, então tudo o que ela **decide** vive aqui. Sem isto, "pode enviar"
 * ficaria espalhado em três `&&` dentro do JSX, onde ninguém lê e nada cobra.
 */

export interface AcompanhanteForm {
  nome: string;
  cpf: string;
  nascimento: string;
}

export interface EnrollmentForm {
  nome: string;
  cpf: string;
  nascimento: string;
  email: string;
  telefone: string;
  /** CL-02: o mesmo bloco do cadastro, com o mesmo autocomplete por CEP. */
  endereco: AddressDraft;
  marca: string;
  modelo: string;
  placa: string;
  acompanhantes: AcompanhanteForm[];
  aceite: boolean;
}

export function formularioVazio(): EnrollmentForm {
  return {
    nome: '',
    cpf: '',
    nascimento: '',
    email: '',
    telefone: '',
    endereco: EMPTY_ADDRESS_DRAFT,
    marca: '',
    modelo: '',
    placa: '',
    acompanhantes: [],
    aceite: false,
  };
}

export function acompanhanteVazio(): AcompanhanteForm {
  return { nome: '', cpf: '', nascimento: '' };
}

const preenchido = (valor: string) => valor.trim() !== '';

/** Uma linha de acompanhante sem nada é ruído de tela, não uma pessoa. */
function emBranco(a: AcompanhanteForm): boolean {
  return !preenchido(a.nome) && !preenchido(a.cpf) && !preenchido(a.nascimento);
}

function completo(a: AcompanhanteForm): boolean {
  return preenchido(a.nome) && preenchido(a.cpf) && preenchido(a.nascimento);
}

export function podeEnviar(form: EnrollmentForm, groupId: string | null): boolean {
  // Sem saída não há faixa etária, e sem faixa etária não há preço (§3.4).
  if (groupId === null) return false;

  const responsavel =
    preenchido(form.nome) &&
    preenchido(form.cpf) &&
    preenchido(form.nascimento) &&
    preenchido(form.email) &&
    preenchido(form.telefone);

  // DOC-04 · SEC-11: o aceite é capturado na inscrição, e cobre o dado de criança que o
  // responsável está informando por ela.
  if (!responsavel || !form.aceite) return false;

  /*
   * Acompanhante pela metade trava o envio, em vez de ir incompleto: sem o nascimento não há
   * faixa etária, e a saída seria congelada com o preço errado na alocação.
   */
  return form.acompanhantes.every((a) => emBranco(a) || completo(a));
}

export interface DadosDoLink {
  readonly roteiro: string;
  readonly saida?: string | undefined;
  readonly groupId: string;
}

/**
 * O corpo no formato canônico, que é o mesmo que o webhook já fala.
 *
 * **Bloco vazio não viaja.** O contrato do servidor é fechado (`.strict()`, com mínimo em cada
 * texto): mandar um endereço com tudo em branco viraria 400 na cara de quem preencheu o que
 * importava.
 */
export function corpoDaInscricao(form: EnrollmentForm, link: DadosDoLink): Record<string, unknown> {
  const endereco = semVazios({ ...form.endereco });
  const veiculo = semVazios({ brand: form.marca, model: form.modelo, plate: form.placa });
  const companions = form.acompanhantes.filter(completo).map((a) => ({
    full_name: a.nome.trim(),
    cpf: a.cpf.trim(),
    birth_date: a.nascimento.trim(),
  }));

  return {
    roteiro: link.roteiro,
    groupId: link.groupId,
    ...(link.saida === undefined ? {} : { saida: link.saida }),
    responsible: {
      full_name: form.nome.trim(),
      cpf: form.cpf.trim(),
      birth_date: form.nascimento.trim(),
      email: form.email.trim(),
      phone: form.telefone.trim(),
    },
    ...(endereco === null ? {} : { address: endereco }),
    ...(veiculo === null ? {} : { vehicle: veiculo }),
    ...(companions.length === 0 ? {} : { companions }),
    consent: form.aceite,
  };
}

/** `null` quando não sobrou campo nenhum — é o sinal de que o bloco não deve viajar. */
function semVazios(campos: Record<string, string>): Record<string, string> | null {
  const limpo: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(campos)) {
    if (preenchido(valor)) limpo[chave] = valor.trim();
  }
  return Object.keys(limpo).length === 0 ? null : limpo;
}
