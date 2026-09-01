import {
  mapCanonicalV1Payload,
  mapWpFlatPayload,
  readCanonicalV1Identity,
  readWpFlatIdentity,
  type MappedIntake,
} from '@expedition/domain';

/**
 * IN-01b — registro de perfis de mapeamento por `source`. Cada perfil traduz o corpo cru
 * do seu formato para a mesma forma interna (`MappedIntake`) e sabe extrair o
 * identificador estrutural sem validar o resto (para dedup/erro, IN-05). O domínio guarda
 * os tradutores; aqui só se escolhe qual usar. Origem desconhecida → `null` (a borda
 * responde `unsupported_source`).
 */
export interface IntakeProfile {
  readonly map: (raw: unknown) => MappedIntake;
  readonly readIdentity: (raw: unknown) => { formId: string; entryId: string };
}

const PROFILES: Record<string, IntakeProfile> = {
  wp_flat_v1: { map: mapWpFlatPayload, readIdentity: readWpFlatIdentity },
  canonical_v1: { map: mapCanonicalV1Payload, readIdentity: readCanonicalV1Identity },
};

export function resolveIntakeProfile(source: string): IntakeProfile | null {
  return PROFILES[source] ?? null;
}
