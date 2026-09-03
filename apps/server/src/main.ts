import {
  createPrismaClient,
  prismaBookingRepository,
  prismaCustomerRepository,
  prismaItineraryRepository,
  prismaApiKeyRepository,
  prismaCashbackRepository,
  prismaCouponRepository,
  prismaFormMappingRepository,
  prismaIntakeRepository,
  prismaTenantRepository,
  prismaPaymentRepository,
  prismaScheduleRepository,
  prismaSupplierRepository,
  prismaVehicleRepository,
  prismaIdentityChangeRepository,
  prismaAuditLogRepository,
  prismaLegalDocumentRepository,
  prismaCommunicationConsentRepository,
  prismaMediaConsentRepository,
  prismaCommunityRepository,
  prismaUnitOfWork,
  resendNotificationGateway,
  resendTeamNoticeGateway,
  supabaseAuthAdmin,
  prismaMembershipRepository,
  prismaAutomationRepository,
  prismaAutomationRunRepository,
  prismaAutomationRunStepRepository,
  prismaChannelIntegrationRepository,
  prismaConversationRepository,
  supabaseMediaStore,
  evolutionGateway,
  prismaOpportunityRepository,
  prismaPaymentIntegrationRepository,
  prismaPaymentChargeRepository,
  newWebhookSecret,
  asaasGateway,
  createTokenCipher,
} from '@expedition/infrastructure';
import type {
  AuthAdminGateway,
  MediaStore,
  NotificationGateway,
  TeamNoticeGateway,
  RequestContext,
} from '@expedition/application';
import type { TokenCipher } from '@expedition/infrastructure';
import { buildServer, type ServerDeps } from './buildServer.js';
import { inMemoryCustomers } from './dev/inMemoryCustomers.js';
import { inMemoryVehicles } from './dev/inMemoryVehicles.js';
import { inMemoryItineraries } from './dev/inMemoryItineraries.js';
import { inMemorySchedule } from './dev/inMemorySchedule.js';
import { inMemoryBookings } from './dev/inMemoryBookings.js';
import { inMemoryPayments } from './dev/inMemoryPayments.js';
import { inMemorySuppliers } from './dev/inMemorySuppliers.js';
import { inMemoryApiKeys, inMemoryIntake } from './dev/inMemoryIntake.js';
import { inMemoryFormMappings } from './dev/inMemoryFormMappings.js';
import { inMemoryTenants } from './dev/inMemoryTenants.js';
import { inMemoryCashback } from './dev/inMemoryCashback.js';
import { inMemoryCoupons } from './dev/inMemoryCoupons.js';
import { inMemoryIdentityChange } from './dev/inMemoryIdentityChange.js';
import { inMemoryAudit } from './dev/inMemoryAudit.js';
import { inMemoryMemberships } from './dev/inMemoryMemberships.js';
import { inMemoryAutomations, inMemoryAutomationRuns } from './dev/inMemoryAutomations.js';
import {
  inMemoryChannelIntegrations,
  inMemoryConversations,
  inMemoryMediaStore,
  inMemoryMessagingGateway,
} from './dev/inMemoryMessaging.js';
import { inMemoryOpportunities } from './dev/inMemoryOpportunities.js';
import { inMemoryLegalDocuments } from './dev/inMemoryLegalDocuments.js';
import { inMemoryConsents } from './dev/inMemoryConsents.js';
import { inMemoryCommunity } from './dev/inMemoryCommunity.js';
import {
  inMemoryPaymentIntegrations,
  inMemoryPaymentCharges,
} from './dev/inMemoryPaymentGateway.js';
import { inMemoryMediaConsents } from './dev/inMemoryMediaConsents.js';
import { makeJwksResolveContext, makeJwtResolveContext } from './auth/resolveContext.js';
import { withMembershipCheck } from './auth/withMembership.js';
import { authConfigFrom, requireDatabase } from './auth/authRequired.js';
import { missingEnvWarning } from './env/missingEnvWarning.js';
import type { FastifyRequest } from 'fastify';

// tsx não carrega .env sozinho; Node 24 tem carregador nativo.
try {
  process.loadEnvFile();
} catch {
  // sem .env local — segue com o ambiente
}

// Ator de dev enquanto a autenticação (magic link do Supabase) não existe.
const DEV_ACTOR = {
  kind: 'team',
  userId: '00000000-0000-0000-0000-000000000001',
  role: 'owner',
} as const;

function databaseConfigured(): boolean {
  const url = process.env['DATABASE_URL'];
  return Boolean(url) && !url!.includes('[SENHA]');
}

/** Notificações via Resend só quando a API key e o remetente estão no ambiente. */
function buildNotifications(): NotificationGateway | undefined {
  const apiKey = process.env['RESEND_API_KEY'];
  const from = process.env['RESEND_FROM'];
  if (!apiKey || !from) {
    // O guarda acima e a lista abaixo são a mesma condição: o aviso existe.
    console.warn(
      missingEnvWarning(
        process.env,
        ['RESEND_API_KEY', 'RESEND_FROM'],
        'notificações ao cliente desligadas.',
      )!,
    );
    return undefined;
  }
  return resendNotificationGateway({ apiKey, from });
}

/**
 * AU-13 — o aviso à equipe usa o mesmo provedor e as mesmas variáveis do aviso ao cliente:
 * é o mesmo e-mail saindo do mesmo remetente, para outra audiência. Uma segunda configuração
 * seria uma segunda coisa para esquecer de preencher.
 */
function buildTeamNotices(): TeamNoticeGateway | undefined {
  const apiKey = process.env['RESEND_API_KEY'];
  const from = process.env['RESEND_FROM'];
  if (!apiKey || !from) return undefined;
  return resendTeamNoticeGateway({ apiKey, from });
}

/** Admin de identidade (§3.7) só com URL do Supabase + `service_role`; senão a rota é 503. */
function buildAuthAdmin(): AuthAdminGateway | undefined {
  const url = process.env['SUPABASE_URL'];
  const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !serviceRoleKey) {
    console.warn(
      missingEnvWarning(
        process.env,
        ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
        'convite de equipe indisponível.',
      )!,
    );
    return undefined;
  }
  return supabaseAuthAdmin({ url, serviceRoleKey });
}

/**
 * AT-13 — o bucket privado das conversas. Sem `SUPABASE_URL` e `service_role`, o anexo
 * simplesmente não é guardado: a mensagem entra com o marcador e a conversa segue legível.
 * É o mesmo desenho da cifra de credenciais — falta de configuração degrada, não derruba.
 */
function buildConversationMedia(): MediaStore {
  const url = process.env['SUPABASE_URL'];
  const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !serviceRoleKey) {
    console.warn(
      missingEnvWarning(
        process.env,
        ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
        'mídia das conversas não será guardada.',
      )!,
    );
    return {
      save: () => Promise.resolve(null),
      signedUrls: () => Promise.resolve(new Map<string, string>()),
    };
  }
  return supabaseMediaStore({ url, serviceRoleKey });
}

function buildDeps(): ServerDeps {
  // SEC-01: fora de desenvolvimento, sem banco o servidor recusa subir — o fallback em
  // memória traz um ator de owner fixo e sem autenticação.
  requireDatabase(process.env, process.env['NODE_ENV']);

  if (!databaseConfigured()) {
    console.warn(
      '[dev] DATABASE_URL não configurada — usando repositório in-memory (não persiste).',
    );
    const bookings = inMemoryBookings();
    return {
      customers: inMemoryCustomers(),
      memberships: inMemoryMemberships(),
      opportunities: inMemoryOpportunities(),
      channelIntegrations: inMemoryChannelIntegrations(),
      conversations: inMemoryConversations(),
      messagingGateway: inMemoryMessagingGateway(),
      conversationMedia: inMemoryMediaStore(),
      automations: inMemoryAutomations(),
      ...inMemoryAutomationRuns(),
      vehicles: inMemoryVehicles(),
      itineraries: inMemoryItineraries(),
      schedule: inMemorySchedule(),
      bookings,
      payments: inMemoryPayments(bookings.rows),
      suppliers: inMemorySuppliers(),
      apiKeys: inMemoryApiKeys([
        {
          token: 'epk_test_dev_token',
          tenantSlug: 'dev-tenant',
          tenantId: 'dev-tenant',
          keyId: 'dev-key',
          scopes: ['intake:write'],
        },
      ]),
      intake: inMemoryIntake(),
      formMappings: inMemoryFormMappings(),
      tenants: inMemoryTenants(),
      cashback: inMemoryCashback(),
      coupons: inMemoryCoupons(bookings.rows),
      identityRequests: inMemoryIdentityChange(),
      audit: inMemoryAudit(),
      documents: inMemoryLegalDocuments(),
      consents: inMemoryConsents(),
      community: inMemoryCommunity(),
      media: inMemoryMediaConsents(),
      ...devPaymentGatewayDeps(),
      authAdmin: buildAuthAdmin(),
      notifications: buildNotifications(),
      teamNotices: buildTeamNotices(),
      resolveContext: () => Promise.resolve({ tenantId: 'dev-tenant', actor: DEV_ACTOR }),
    };
  }
  const base = createPrismaClient();
  return {
    customers: prismaCustomerRepository(base),
    vehicles: prismaVehicleRepository(base),
    itineraries: prismaItineraryRepository(base),
    schedule: prismaScheduleRepository(base),
    bookings: prismaBookingRepository(base),
    payments: prismaPaymentRepository(base),
    suppliers: prismaSupplierRepository(base),
    apiKeys: prismaApiKeyRepository(base),
    intake: prismaIntakeRepository(base),
    formMappings: prismaFormMappingRepository(base),
    tenants: prismaTenantRepository(base),
    cashback: prismaCashbackRepository(base),
    coupons: prismaCouponRepository(base),
    identityRequests: prismaIdentityChangeRepository(base),
    audit: prismaAuditLogRepository(base),
    documents: prismaLegalDocumentRepository(base),
    consents: prismaCommunicationConsentRepository(base),
    community: prismaCommunityRepository(base),
    media: prismaMediaConsentRepository(base),
    ...paymentGatewayDeps(base),
    ...messagingDeps(base),
    uow: prismaUnitOfWork(base),
    authAdmin: buildAuthAdmin(),
    notifications: buildNotifications(),
    teamNotices: buildTeamNotices(),
    memberships: prismaMembershipRepository(base),
    opportunities: prismaOpportunityRepository(base),
    resolveContext: resolveContextForProd(base),
  };
}

/**
 * Auth real do Supabase (§3.7). Em desenvolvimento e teste, sem configuração, cai num stub
 * por slug — para tocar o backend antes de plugar o Auth. **Fora disso, recusa subir**:
 * ver `authConfigFrom`.
 */
function resolveContextForProd(base: ReturnType<typeof createPrismaClient>) {
  /*
   * SEC-01: a decisão está em `authConfigFrom` (pura e testada). Fora de desenvolvimento,
   * ausência das três variáveis **lança** — antes daqui saía um stub que aceitava qualquer
   * requisição anônima como `owner`, com o tenant escolhido por header. Falha aberta é a
   * pior forma de falhar: o sistema segue respondendo 200 e ninguém percebe.
   */
  const config = authConfigFrom(process.env, process.env['NODE_ENV']);

  /*
   * SEC-17: com auth real, o token prova quem é a pessoa e o banco decide o que ela pode.
   * O stub de dev fica **de fora** de propósito: ele já é declaradamente sem auth, e
   * exigir linha de acesso ali trancaria o desenvolvimento local, onde ninguém tem uma.
   */
  const comAcesso = (resolve: (request: FastifyRequest) => Promise<RequestContext>) =>
    withMembershipCheck(resolve, { memberships: prismaMembershipRepository(base) });

  if (config.kind === 'jwks') return comAcesso(makeJwksResolveContext(config.url, config.issuer));
  if (config.kind === 'secret')
    return comAcesso(makeJwtResolveContext(config.secret, config.issuer));

  console.warn(
    '[dev] SUPABASE_URL/JWKS/JWT_SECRET ausentes — resolveContext usa stub por x-tenant-slug (SEM auth).',
  );
  return async (request: FastifyRequest) => {
    const slug = (request.headers['x-tenant-slug'] as string | undefined) ?? 'drk';
    const tenant = await base.tenant.findFirst({ where: { slug } });
    if (!tenant) throw new Error(`tenant "${slug}" não encontrado`);
    return { tenantId: tenant.id, actor: DEV_ACTOR };
  };
}

async function main(): Promise<void> {
  const corsOrigins = (process.env['CORS_ORIGINS'] ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  /*
   * AU-04 — o motor liga por variável de ambiente, e **desliga do mesmo jeito**.
   *
   * Ligado é o normal em produção. A variável existe para o caso em que uma automação começa
   * a fazer algo errado de um jeito que o interruptor por automação não cobre: dá para parar
   * tudo mudando a variável, sem esperar deploy. Fora de produção fica desligado, para quem
   * roda o servidor local não disparar mensagem sem querer.
   */
  const automationEngine =
    (process.env['AUTOMATION_ENGINE'] ??
      (process.env['NODE_ENV'] === 'production' ? 'on' : 'off')) !== 'off';
  const app = await buildServer({ corsOrigins, deps: buildDeps(), automationEngine });
  const port = Number(process.env['PORT'] ?? 3000);
  await app.listen({ port, host: '0.0.0.0' });
}

main().catch((error: unknown) => {
  console.error('Falha ao subir o servidor:', error);
  process.exitCode = 1;
});

/**
 * PG-01 — o gateway em produção. A credencial do ASAAS só entra no banco cifrada, e a
 * chave da cifra vem do ambiente.
 *
 * Sem `PAYMENT_TOKEN_KEY` o servidor **sobe assim mesmo**, mas com a cifra indisponível:
 * conectar falha com mensagem clara e nada é guardado. Derrubar o sistema inteiro por
 * causa de uma integração opcional seria pior; guardar a chave em claro, muito pior.
 */
function paymentGatewayDeps(base: ReturnType<typeof createPrismaClient>) {
  return {
    paymentIntegrations: prismaPaymentIntegrationRepository(base, credentialCipher()),
    charges: prismaPaymentChargeRepository(base),
    paymentGateway: asaasGateway(),
    newWebhookSecret,
  };
}

/**
 * §5.17 — atendimento. A chave da instância do provedor é guardada com a **mesma** cifra das
 * credenciais de pagamento: são o mesmo tipo de segredo (credencial de terceiro que precisa
 * voltar em claro para chamar a API) e uma segunda chave seria mais uma coisa para perder —
 * perder qualquer uma delas torna o que está cifrado ilegível.
 */
function messagingDeps(base: ReturnType<typeof createPrismaClient>) {
  return {
    channelIntegrations: prismaChannelIntegrationRepository(base, credentialCipher()),
    conversations: prismaConversationRepository(base),
    messagingGateway: evolutionGateway(),
    conversationMedia: buildConversationMedia(),
    automations: prismaAutomationRepository(base),
    automationRuns: prismaAutomationRunRepository(base),
    automationRunSteps: prismaAutomationRunStepRepository(base),
  };
}

/**
 * A cifra das credenciais de terceiros. Sem `PAYMENT_TOKEN_KEY` ela existe mas **falha ao
 * ser usada**: o servidor sobe e o resto do sistema funciona; quem tentar conectar um gateway
 * ou um canal recebe o erro na cara, em vez de guardar em claro.
 */
function credentialCipher(): TokenCipher {
  const key = process.env['PAYMENT_TOKEN_KEY'];
  return key ? createTokenCipher(key) : unavailableCipher();
}

function unavailableCipher(): TokenCipher {
  const fail = (): never => {
    throw new Error(
      'PAYMENT_TOKEN_KEY ausente: gere 32 bytes em hex (openssl rand -hex 32) para usar o gateway de pagamento.',
    );
  };
  return { encrypt: fail, decrypt: fail };
}

/** Em dev sem banco não há onde guardar credencial: a tela de integração fica vazia. */
function devPaymentGatewayDeps() {
  return {
    paymentIntegrations: inMemoryPaymentIntegrations(),
    charges: inMemoryPaymentCharges(),
    paymentGateway: asaasGateway(),
    newWebhookSecret,
  };
}
