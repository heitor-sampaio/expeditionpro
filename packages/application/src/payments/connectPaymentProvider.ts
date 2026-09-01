import { BusinessRuleError, ForbiddenError, RequiredFieldError } from '../errors.js';
import { actorUserId } from '../audit/auditLogRepository.js';
import type { RequestContext } from '../context.js';
import type { AuditLogRepository } from '../audit/auditLogRepository.js';
import type { FeeSettings } from '@expedition/domain';
import type { PaymentGateway } from './paymentGateway.js';
import type {
  PaymentEnvironment,
  PaymentIntegrationRecord,
  PaymentIntegrationRepository,
} from './paymentIntegrationRepository.js';

/**
 * PG-01 — conecta a conta do tenant no gateway. A chave é **validada no provedor antes
 * de ser guardada**: credencial errada guardada só apareceria na primeira cobrança de
 * verdade, na frente do cliente.
 *
 * Sandbox e produção são conexões separadas, cada uma com o próprio segredo de webhook.
 * O segredo nasce aqui e é o que o provedor devolve a cada chamada — é assim que o
 * webhook se prova (PG-03).
 *
 * Exige owner ou admin: dá acesso à conta financeira do tenant, o mesmo peso de cancelar
 * uma saída.
 */

export const ASAAS = 'asaas';

export interface ConnectPaymentProviderDeps {
  readonly integrations: PaymentIntegrationRepository;
  readonly gateway: PaymentGateway;
  readonly audit: AuditLogRepository;
  readonly clock: () => Date;
  /** Gerador do segredo de webhook; a infraestrutura injeta o aleatório de verdade. */
  readonly newSecret?: (() => string) | undefined;
}

export interface ConnectPaymentProviderCommand {
  readonly environment: PaymentEnvironment;
  readonly accessToken: string;
}

export interface ConnectedIntegration {
  readonly environment: PaymentEnvironment;
  readonly accountName: string | null;
  readonly tokenPreview: string;
  readonly connectedAt: Date;
  /** PG-04: taxas negociadas. Não são segredo — a tela precisa delas para editar. */
  readonly feeSettings: FeeSettings;
}

/**
 * O que a conexão devolve **uma única vez**: o segredo que precisa ser colado no painel
 * do ASAAS. Ele não volta na listagem — quem perder reconecta e gera outro, como
 * qualquer segredo compartilhado.
 */
export interface ConnectedIntegrationWithSecret extends ConnectedIntegration {
  /** Em claro **só na primeira conexão**; `null` ao reconectar, quando segue o mesmo. */
  readonly webhookToken: string | null;
}

export async function connectPaymentProvider(
  deps: ConnectPaymentProviderDeps,
  ctx: RequestContext,
  command: ConnectPaymentProviderCommand,
): Promise<ConnectedIntegrationWithSecret> {
  assertCanManage(ctx);

  const accessToken = command.accessToken.trim();
  if (accessToken.length === 0) {
    throw new RequiredFieldError('chave de API');
  }

  const account = await deps.gateway.checkAccount({
    accessToken,
    environment: command.environment,
  });
  if (!account) {
    throw new BusinessRuleError(
      'invalid_credentials',
      'O ASAAS recusou esta chave. Confira o ambiente e a chave copiada.',
    );
  }

  const existing = await deps.integrations.find(ctx.tenantId, ASAAS, command.environment);
  const connectedAt = deps.clock();

  /*
   * SEC-01 — o segredo do webhook é gerado **uma vez** e o banco guarda só o `sha256`.
   * Reconectar mantém o segredo existente: mudar exigiria reconfigurar o webhook no ASAAS,
   * e a confirmação de pagamento pararia de chegar em silêncio até alguém notar.
   *
   * Como o valor em claro não existe mais depois da primeira conexão, a reconexão devolve
   * `null` — que a tela lê como "o token segue o mesmo", não como "não há token".
   */
  const novoSegredo = existing ? null : (deps.newSecret ?? defaultSecret)();

  const record = await deps.integrations.upsert({
    tenantId: ctx.tenantId,
    provider: ASAAS,
    environment: command.environment,
    accessToken,
    ...(novoSegredo === null ? {} : { webhookToken: novoSegredo }),
    accountName: account.name,
    connectedBy: actorUserId(ctx.actor),
    connectedAt,
  });

  await deps.audit.record({
    tenantId: ctx.tenantId,
    actorUserId: actorUserId(ctx.actor),
    entity: 'payment_integration',
    entityId: record.id,
    action: 'payment_integration.connect',
    diff: { provider: ASAAS, environment: command.environment },
  });

  return { ...toView(record), webhookToken: novoSegredo };
}

/** O que a tela pode ver de uma conexão: nunca o token, só o suficiente para conferir. */
export function toView(record: PaymentIntegrationRecord): ConnectedIntegration {
  return {
    environment: record.environment,
    accountName: record.accountName,
    tokenPreview: previewOf(record.accessToken),
    connectedAt: record.connectedAt,
    feeSettings: record.feeSettings,
  };
}

/** Últimos quatro caracteres: confere qual chave está lá sem revelar a chave. */
function previewOf(token: string): string {
  return `•••• ${token.slice(-4)}`;
}

export function assertCanManage(ctx: RequestContext): void {
  const { actor } = ctx;
  if (!(actor.kind === 'team' && (actor.role === 'owner' || actor.role === 'admin'))) {
    throw new ForbiddenError('Conectar o gateway exige owner ou admin');
  }
}

/**
 * Fallback só para os testes de caso de uso; em produção a infraestrutura injeta
 * `newSecret` com `randomBytes` — segredo de webhook não sai daqui.
 */
let secretSeq = 0;
function defaultSecret(): string {
  secretSeq += 1;
  return `whk_test_${secretSeq}`;
}
