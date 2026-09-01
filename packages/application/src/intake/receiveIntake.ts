import { BusinessRuleError, UnauthorizedError } from '../errors.js';
import { describeProcessingError } from './intakeProcessingError.js';
import { resolveIntakeProfile } from './intakeProfiles.js';
import type { ApiKeyRepository, IntakeRepository } from './intakeRepository.js';
import type { FormMappingRepository } from './formMappingRepository.js';

/**
 * IN-01/IN-02/IN-05 — receptor do webhook. Confere a API key (§3.9, IN-22) antes de
 * qualquer gravação; deduplica por `{form_id}:{entry_id}` (IN-02); aplica o perfil de
 * mapeamento (síncrono, função pura). Sucesso → guarda o corpo cru + o normalizado como
 * `needs_allocation`. Falha de processamento → guarda o corpo cru como `error` (IN-05,
 * payload preservado, com reprocessar) e ainda **responde 422 no campo culpado** — o
 * remetente é avisado e a inscrição não se perde. Vira `booking` só quando o admin aloca.
 */

export interface ReceiveIntakeDeps {
  readonly apiKeys: ApiKeyRepository;
  readonly intake: IntakeRepository;
  /** IN-20: mapa form_id→roteiro. Ausente = nenhuma resolução (roteiro fica null). */
  readonly formMappings?: FormMappingRepository | undefined;
}

export interface ReceiveIntakeCommand {
  readonly tenantSlug: string;
  readonly token: string | undefined;
  readonly source: string;
  readonly rawBody: unknown;
}

export interface ReceivedIntake {
  readonly intakeId: string;
  readonly status: 'queued' | 'duplicate';
}

const INTAKE_SCOPE = 'intake:write';

export async function receiveIntake(
  deps: ReceiveIntakeDeps,
  command: ReceiveIntakeCommand,
): Promise<ReceivedIntake> {
  if (!command.token) {
    throw new UnauthorizedError('API key ausente');
  }
  const verified = await deps.apiKeys.verify(command.token, command.tenantSlug, INTAKE_SCOPE);
  if (!verified) {
    throw new UnauthorizedError('API key inválida');
  }

  const profile = resolveIntakeProfile(command.source);
  if (!profile) {
    throw new BusinessRuleError(
      'unsupported_source',
      `Perfil de origem não suportado: ${command.source}`,
    );
  }

  // Identidade estrutural do corpo cru — dá o externalId para deduplicar mesmo se o
  // mapeamento completo falhar (a validação estoura nos campos do responsável, depois desta).
  const { formId, entryId } = profile.readIdentity(command.rawBody);
  const externalId = `${formId}:${entryId}`;
  const isTest = command.token.includes('_test_');

  const existing = await deps.intake.findByExternalId(
    verified.tenantId,
    command.source,
    externalId,
  );
  if (existing) {
    await deps.apiKeys.touch(verified.keyId);
    return { intakeId: existing.id, status: 'duplicate' };
  }

  // IN-20: resolve o roteiro pelo mapa form_id→roteiro. Estrutural, então vale mesmo se o
  // mapeamento completo falhar — a inscrição em erro já chega com o roteiro sugerido.
  const itineraryId =
    (formId &&
      (await deps.formMappings?.resolveItinerary(verified.tenantId, command.source, formId))) ||
    null;

  let mapped;
  try {
    mapped = profile.map(command.rawBody); // lança IntakeValidationError (422)
  } catch (error) {
    // IN-05: não perde o payload — guarda como `error` para reprocessar, e relança (422).
    await deps.intake.store({
      tenantId: verified.tenantId,
      source: command.source,
      externalId,
      payload: command.rawBody,
      normalized: null,
      formId: formId || null,
      itineraryId,
      submittedAt: null,
      status: 'error',
      error: describeProcessingError(error),
      isTest,
    });
    await deps.apiKeys.touch(verified.keyId);
    throw error;
  }

  const stored = await deps.intake.store({
    tenantId: verified.tenantId,
    source: command.source,
    externalId,
    payload: command.rawBody,
    normalized: mapped,
    formId: mapped.formId,
    itineraryId,
    submittedAt: mapped.submitted,
    status: 'needs_allocation',
    error: null,
    isTest,
  });
  await deps.apiKeys.touch(verified.keyId);

  return { intakeId: stored.id, status: 'queued' };
}
