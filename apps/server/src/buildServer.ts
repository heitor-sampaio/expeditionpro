import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type {
  ApiKeyRepository,
  AuditLogRepository,
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
  /** Logger do Fastify. Desligue nos testes para saída limpa. Default: ligado. */
  readonly logger?: boolean;
  /** Casos de uso e resolução de contexto. Sem isso, só o health check sobe. */
  readonly deps?: ServerDeps;
}

export async function buildServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? true,
    genReqId: () => crypto.randomUUID(),
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
