/**
 * Núcleo puro do Termo de Adesão (§5.13) — sem I/O. Duas regras que são fáceis de errar
 * e caras quando erradas: quando um cliente precisa (re)aceitar a versão vigente
 * (DOC-03/DOC-04), e a substituição das variáveis do termo pelos dados reais (DOC-07).
 *
 * A prova de consentimento mora aqui: aceite é por (cliente, versão); publicar uma versão
 * que exige reaceite invalida a cobertura de versões anteriores, senão não.
 */

/** Versão vigente publicada do termo. `null` = nenhum termo publicado ainda. */
export interface PublishedVersion {
  readonly id: string;
  readonly versionNumber: number;
  readonly requiresReacceptance: boolean;
}

export interface AcceptanceInput {
  readonly current: PublishedVersion | null;
  /** Números de versão que o cliente já aceitou (qualquer ordem). */
  readonly acceptedVersionNumbers: readonly number[];
}

export interface AcceptanceRequirement {
  readonly mustAccept: boolean;
  readonly versionId?: string;
  readonly versionNumber?: number;
}

/**
 * DOC-03/DOC-04 — precisa aceitar quando há termo vigente e o cliente ainda não está
 * coberto. Está coberto se aceitou exatamente a versão vigente; ou se aceitou qualquer
 * versão anterior e a vigente **não** exige reaceite ("vale para os aceites seguintes").
 */
export function resolveAcceptanceRequirement(input: AcceptanceInput): AcceptanceRequirement {
  const { current, acceptedVersionNumbers } = input;
  if (current === null) {
    return { mustAccept: false };
  }
  if (acceptedVersionNumbers.includes(current.versionNumber)) {
    return { mustAccept: false };
  }
  const acceptedSomeEarlier = acceptedVersionNumbers.some((n) => n < current.versionNumber);
  if (acceptedSomeEarlier && !current.requiresReacceptance) {
    return { mustAccept: false };
  }
  return { mustAccept: true, versionId: current.id, versionNumber: current.versionNumber };
}

/** Marcadores reconhecidos no termo (§5.13). Qualquer outro fica literal. */
export type TermVariables = Readonly<Record<string, string>>;

const MARKER = /\{\{\s*([a-z_]+)\s*\}\}/g;

/**
 * DOC-07 — substitui `{{marcador}}` pelos valores fornecidos. Marcador sem valor
 * permanece literal (nunca vira "undefined") — o termo é contrato, não pode ter buraco.
 */
export function renderTermTemplate(template: string, vars: TermVariables): string {
  return template.replace(MARKER, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key]! : whole,
  );
}
