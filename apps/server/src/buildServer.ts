import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, {
  type FastifyInstance,
  type FastifyRequest,
  type FastifyServerOptions,
} from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type {
  ApiKeyRepository,
  AuditLogRepository,
  MembershipRepository,
  OpportunityRepository,
  ChannelIntegrationRepository,
  ConversationRepository,
  AuthAdminGateway,
  BookingRepository,
  CashbackRepository,
  CouponRepository,
  CommunicationConsentRepository,
  CommunityRepository,
  CustomerRepository,
  FormMappingRepository,
  MediaConsentRepository,
  PaymentIntegrationRepository,
  PaymentChargeRepository,
  PaymentGateway,
  IdentityChangeRepository,
  IntakeRepository,
  LegalDocumentRepository,
  ItineraryRepository,
  NotificationGateway,
  PaymentRepository,
  RequestContext,
  ScheduleRepository,
  SupplierRepository,
  TenantRepository,
  UnitOfWork,
  VehicleRepository,
} from '@expedition/application';
import { installErrorHandler } from './errors.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerCustomerRoutes } from './routes/customers.js';
import { registerVehicleRoutes } from './routes/vehicles.js';
import { registerItineraryRoutes } from './routes/itineraries.js';
import { registerScheduleRoutes } from './routes/schedule.js';
import { registerBookingRoutes } from './routes/bookings.js';
import { registerSupplierRoutes } from './routes/suppliers.js';
import { registerSupplierCategoryRoutes } from './routes/supplierCategories.js';
import { registerIntakeRoutes } from './routes/intake.js';
import { registerPaymentGatewayRoutes } from './routes/paymentGateway.js';
import { registerCashbackRoutes } from './routes/cashback.js';
import { registerTeamRoutes } from './routes/team.js';
import { registerPortalRoutes } from './routes/portal.js';
import { registerDocumentRoutes } from './routes/documents.js';
import { registerConsentRoutes } from './routes/communications.js';
import { registerReportRoutes } from './routes/reports.js';
import { registerCommunityRoutes } from './routes/community.js';
import { registerCouponRoutes } from './routes/coupons.js';
import { registerCrmRoutes } from './routes/crm.js';
import { registerInboxRoutes } from './routes/inbox.js';
import { registerCompanyRoutes, registerCrewRoutes } from './routes/company.js';

/**
 * Dependências dos casos de uso, injetadas na borda. `resolveContext` é o assento
 * da autenticação: hoje um stub de dev, amanhã o verificador do JWT do Supabase
 * (app_metadata → tenant + papel). Trocar auth mexe só nessa função.
 */
export interface ServerDeps {
  readonly customers: CustomerRepository;
  readonly vehicles: VehicleRepository;
  readonly itineraries: ItineraryRepository;
  readonly schedule: ScheduleRepository;
  readonly bookings: BookingRepository;
  readonly payments: PaymentRepository;
  readonly suppliers: SupplierRepository;
  readonly apiKeys: ApiKeyRepository;
  readonly intake: IntakeRepository;
  /** IN-20: mapa form_id→roteiro (Configurações → Integrações). */
  readonly formMappings: FormMappingRepository;
  /** DOC-08: identidade da empresa (nome + CNPJ) para o snapshot do Termo. */
  readonly tenants: TenantRepository;
  readonly cashback: CashbackRepository;
  /** §5.15: cupons de desconto e resgates. */
  readonly coupons: CouponRepository;
  readonly identityRequests: IdentityChangeRepository;
  /** §3.2.1 · A09: trilha de auditoria das ações sensíveis (reorg, merge, chave, CPF). */
  readonly audit: AuditLogRepository;
  /** SEC-17: quem tem acesso ao sistema. Fonte da verdade do papel, lida por requisição. */
  readonly memberships: MembershipRepository;
  /** §5.16: funil de oportunidades. Vive antes do dinheiro e não encosta nele (OP-09). */
  readonly opportunities: OpportunityRepository;
  /** §5.17: conexão do tenant com cada canal de mensagem (AT-01). */
  readonly channelIntegrations: ChannelIntegrationRepository;
  /** §5.17: a caixa de conversas — compartilhada por toda a equipe (AT-07). */
  readonly conversations: ConversationRepository;
  /** §5.13: Termo de adesão (versionamento + aceite). */
  readonly documents: LegalDocumentRepository;
  /** §5.9 · DOC-06: consentimento de comunicação por canal (marketing). */
  readonly consents: CommunicationConsentRepository;
  /** §5.12: comunidade (posts, curtidas, comentários, denúncias). */
  readonly community: CommunityRepository;
  /** §5.12 · CO-10: consentimento de uso de imagem (ledger por escopo). */
  readonly media: MediaConsentRepository;
  /** PG-01: conexão do tenant com o gateway (ASAAS), por ambiente. */
  readonly paymentIntegrations: PaymentIntegrationRepository;
  /** PG-02: cobranças emitidas para inscrições. */
  readonly charges: PaymentChargeRepository;
  /** PG-01/PG-02: o provedor de pagamento em si (HTTP). */
  readonly paymentGateway: PaymentGateway;
  /** PG-01: gerador do segredo de webhook. Ausente = o caso de uso usa o dele. */
  readonly newWebhookSecret?: (() => string) | undefined;
  /**
   * §5.7.2: transação única da alocação (cria cliente, booking, marca intake e grava
   * aceite — tudo ou nada). Ausente = fallback passthrough sobre os repos (dev/in-memory).
   */
  readonly uow?: UnitOfWork | undefined;
  /** §3.7: admin de identidade (convite de equipe). Ausente = rota de convite indisponível. */
  readonly authAdmin?: AuthAdminGateway | undefined;
  /** PC-23: notificações ao cliente. Ausente = nenhum e-mail é enviado (best-effort). */
  readonly notifications?: NotificationGateway | undefined;
  readonly resolveContext: (request: FastifyRequest) => Promise<RequestContext>;
  /** Relógio do servidor para timestamps de borda (ex.: confirmed_at). Default: Date real. */
  readonly clock?: () => Date;
}

export interface ServerOptions {
  /** Origens permitidas no CORS (domínios do tenant, IN-24). Vazio = nega tudo. */
  readonly corsOrigins?: readonly string[];
  /**
   * Logger do Fastify. `false` desliga (saída limpa nos testes); um objeto de opções
   * substitui a configuração padrão — é como um teste captura o que foi registrado.
   */
  readonly logger?: FastifyServerOptions['logger'];
  /** Casos de uso e resolução de contexto. Sem isso, só o health check sobe. */
  readonly deps?: ServerDeps;
}

/**
 * SEC-01 — o log de acesso do Fastify inclui a query string, e a busca de cliente aceita
 * **nome, CPF ou telefone** em `?q=`. Sem redação, `?q=90000010057` ficava em claro num
 * agregador de log, que costuma ter retenção longa e público mais amplo que o back-office.
 *
 * Também apaga os cabeçalhos de credencial: nenhum deles é logado por padrão hoje, mas
 * depender de um padrão para não vazar segredo é depender de sorte.
 */
function loggerConfig() {
  return {
    redact: {
      paths: [
        'req.query.q',
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["api_token"]',
        'req.headers["asaas-access-token"]',
        'req.headers["x-webhook-token"]',
      ],
      censor: '[redacted]',
    },
  };
}

export async function buildServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? loggerConfig(),
    genReqId: () => crypto.randomUUID(),
    /*
     * SEC-01 — atrás do proxy do Railway toda conexão chega do IP do proxy. Sem isto:
     *   · o rate limit vira **um balde único para a internet inteira** — 30 req/min na
     *     vitrine derrubam a vitrine para todos, e um cliente legítimo é bloqueado por
     *     ruído de terceiros;
     *   · o `x-forwarded-for` que a prova de aceite grava (DOC-05) fica **forjável**, e
     *     esse IP é evidência jurídica de consentimento.
     */
    trustProxy: true,
    /*
     * SEC — o servidor também desiste.
     *
     * Sem prazo, uma conexão que abre e não termina de enviar o corpo fica aberta
     * indefinidamente: é slowloris, e não precisa de má intenção — rede móvel ruim no meio
     * de uma saída produz o mesmo efeito. Cada conexão pendurada é um socket que não volta.
     *
     * `requestTimeout` é o prazo para a requisição inteira chegar; `connectionTimeout`, para
     * o socket ocioso antes disso. 30s é folgado para qualquer upload que este sistema faz —
     * a foto da comunidade é comprimida no navegador antes de subir.
     */
    requestTimeout: 30_000,
    connectionTimeout: 30_000,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  installErrorHandler(app);

  await app.register(helmet);
  await app.register(cors, {
    origin:
      options.corsOrigins && options.corsOrigins.length > 0 ? [...options.corsOrigins] : false,
  });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

  await app.register(registerHealthRoutes);
  if (options.deps) {
    const { deps } = options;
    await app.register((instance) => {
      registerCustomerRoutes(instance, deps);
      registerVehicleRoutes(instance, deps);
      registerItineraryRoutes(instance, deps);
      registerScheduleRoutes(instance, deps);
      registerBookingRoutes(instance, deps);
      registerSupplierRoutes(instance, deps);
      registerSupplierCategoryRoutes(instance, deps);
      registerIntakeRoutes(instance, deps);
      registerPaymentGatewayRoutes(instance, deps);
      registerCashbackRoutes(instance, deps);
      registerCouponRoutes(instance, deps);
      registerCrmRoutes(instance, deps);
      registerInboxRoutes(instance, deps);
      registerCompanyRoutes(instance, deps);
      registerCrewRoutes(instance, deps);
      registerTeamRoutes(instance, deps);
      registerPortalRoutes(instance, deps);
      registerDocumentRoutes(instance, deps);
      registerConsentRoutes(instance, deps);
      registerReportRoutes(instance, deps);
      registerCommunityRoutes(instance, deps);
      return Promise.resolve();
    });
  }

  return app;
}
