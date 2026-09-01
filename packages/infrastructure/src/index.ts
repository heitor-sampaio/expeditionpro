/**
 * @expedition/infrastructure — adaptadores de plataforma.
 *
 * Prisma, Supabase, Storage. Implementa os ports da aplicação. É a única camada
 * que conhece Prisma. O domínio jamais importa daqui.
 */

export { createPrismaClient, PrismaClient } from './prisma/client.js';
export { tenantClient, type TenantClient } from './prisma/tenantClient.js';
export { prismaUnitOfWork } from './prisma/prismaUnitOfWork.js';
export { prismaCustomerRepository } from './customers/prismaCustomerRepository.js';
export { prismaVehicleRepository } from './vehicles/prismaVehicleRepository.js';
export { prismaItineraryRepository } from './itineraries/prismaItineraryRepository.js';
export { prismaScheduleRepository } from './schedule/prismaScheduleRepository.js';
export { prismaBookingRepository } from './bookings/prismaBookingRepository.js';
export { prismaPaymentRepository } from './payments/prismaPaymentRepository.js';
export { prismaSupplierRepository } from './suppliers/prismaSupplierRepository.js';
export { prismaApiKeyRepository, prismaIntakeRepository } from './intake/prismaIntakeRepository.js';
export { prismaFormMappingRepository } from './intake/prismaFormMappingRepository.js';
export { prismaTenantRepository } from './tenants/prismaTenantRepository.js';
export { prismaCashbackRepository } from './cashback/prismaCashbackRepository.js';
export { prismaCouponRepository } from './coupons/prismaCouponRepository.js';
export {
  renderRoomlistPdf,
  roomlistFileName,
  splitIntoPages,
  toWinAnsi,
} from './documents/roomlistPdf.js';
export {
  renderInsuranceXlsx,
  insuranceFileName,
  dateSerial,
  fillInsuranceSheet,
  readZip,
  writeZip,
} from './documents/insuranceXlsx.js';
export {
  renderConvoyPdf,
  renderConvoyXlsx,
  convoyFileName,
  sheetXml,
} from './documents/convoyDocument.js';
export { supabaseAuthAdmin, type SupabaseAuthAdminConfig } from './auth/supabaseAuthAdmin.js';
export { prismaIdentityChangeRepository } from './identity/prismaIdentityChangeRepository.js';
export { prismaAuditLogRepository } from './audit/prismaAuditLogRepository.js';
export { prismaLegalDocumentRepository } from './documents/prismaLegalDocumentRepository.js';
export { prismaCommunicationConsentRepository } from './communications/prismaCommunicationConsentRepository.js';
export { prismaMediaConsentRepository } from './communications/prismaMediaConsentRepository.js';
export { prismaCommunityRepository } from './community/prismaCommunityRepository.js';
export {
  resendNotificationGateway,
  type ResendConfig,
} from './notifications/resendNotificationGateway.js';
export {
  prismaPaymentIntegrationRepository,
  prismaPaymentChargeRepository,
  newWebhookSecret,
} from './payments/prismaPaymentGatewayRepositories.js';
export { asaasGateway } from './payments/asaasGateway.js';
export { createTokenCipher, type TokenCipher } from './payments/tokenCipher.js';
