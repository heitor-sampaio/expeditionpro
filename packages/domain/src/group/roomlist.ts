import { formatCpf, type Cpf } from '../identity/cpf.js';
import { formatCep } from '../address/cep.js';
import { formatPhone } from '../contact/phone.js';
import { formatLocalDateBR, type LocalDate } from '../date/localDate.js';

/**
 * Roomlist do grupo (GR-15) — o documento que a empresa manda ao hotel.
 *
 * Aqui mora só a regra do documento: quem entra, em que ordem, e como cada dado
 * aparece no papel. Nada de página, fonte ou milímetro (isso é do renderizador), e
 * nada de banco (isso é do caso de uso). O resultado é texto pronto: quem imprime
 * não decide mais nada.
 */

/** Endereço como o documento precisa dele. Espelha o cadastro sem depender da aplicação. */
export interface RoomlistAddress {
  readonly street: string | null;
  readonly number: string | null;
  readonly district: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly zip: string | null;
}

/**
 * Acompanhante no documento: **nome e nascimento, mais nada**. O tipo é a garantia de
 * que CPF de acompanhante não sai da empresa — o hotel não precisa dele para hospedar.
 */
export interface RoomlistGuest {
  readonly fullName: string;
  readonly birthDate: string;
}

/** Uma família a colocar no documento, ainda em value objects. */
export interface RoomlistParty {
  readonly responsible: {
    readonly fullName: string;
    readonly cpf: Cpf;
    readonly birthDate: LocalDate;
    readonly email: string | null;
    readonly phone: string | null;
    readonly address: RoomlistAddress;
  };
  readonly companions: readonly { readonly fullName: string; readonly birthDate: LocalDate }[];
}

/** Um registro pronto para o papel: tudo string, tudo já formatado. */
export interface RoomlistEntry {
  readonly position: number;
  readonly fullName: string;
  readonly cpf: string;
  readonly birthDate: string;
  readonly email: string;
  readonly phone: string;
  readonly address: string;
  readonly companions: readonly RoomlistGuest[];
}

export interface RoomlistInput {
  /** O condutor da empresa, que abre o documento. `null` = a empresa não declarou um. */
  readonly lead: RoomlistParty | null;
  /** As famílias inscritas, **na ordem em que devem aparecer** (a de inscrição). */
  readonly parties: readonly RoomlistParty[];
}

/** O que aparece quando o dado não existe. Campo vazio no papel vira dúvida na recepção. */
const ABSENT = '—';

/**
 * GR-15 — monta o documento. O condutor é o registro 1; as famílias mantêm a ordem
 * recebida. Uma família com o mesmo CPF do condutor é descartada: ele conduz e se
 * hospeda, então pode ter inscrição, mas ocupa **um** registro.
 */
export function buildRoomlist(input: RoomlistInput): readonly RoomlistEntry[] {
  const leadCpf = input.lead?.responsible.cpf ?? null;
  const parties = input.parties.filter((party) => party.responsible.cpf !== leadCpf);
  const ordered = input.lead === null ? parties : [input.lead, ...parties];

  return ordered.map((party, index) => toEntry(party, index + 1));
}

/** O endereço numa linha só, sem separador órfão quando falta pedaço do cadastro. */
export function formatRoomlistAddress(address: RoomlistAddress): string {
  const street = joinPresent([address.street, address.number], ', ');
  const cityState = address.state ? joinPresent([address.city, address.state], '/') : address.city;
  const zip = address.zip ? `CEP ${formatCep(address.zip)}` : null;

  const line = joinPresent([street, address.district, cityState, zip], ' — ');
  return line === '' ? ABSENT : line;
}

function toEntry(party: RoomlistParty, position: number): RoomlistEntry {
  const { responsible } = party;
  return {
    position,
    fullName: responsible.fullName,
    cpf: formatCpf(responsible.cpf),
    birthDate: formatLocalDateBR(responsible.birthDate),
    email: responsible.email ?? ABSENT,
    phone: responsible.phone ? formatPhone(responsible.phone) : ABSENT,
    address: formatRoomlistAddress(responsible.address),
    companions: party.companions.map((companion) => ({
      fullName: companion.fullName,
      birthDate: formatLocalDateBR(companion.birthDate),
    })),
  };
}

function joinPresent(parts: readonly (string | null)[], separator: string): string {
  return parts
    .filter((part): part is string => part !== null && part.trim() !== '')
    .join(separator);
}
