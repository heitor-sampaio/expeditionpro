/**
 * @expedition/application — casos de uso.
 *
 * Orquestra transação, repositório e evento. Define os ports (interfaces) que a
 * infraestrutura implementa; não conhece Prisma nem Fastify. Depende só do domínio.
 */

export type { RequestContext, Actor, TeamRole } from './context.js';
export type {
  CompanyInfo,
  CompanyPatch,
  ConvoyVehicle,
  CrewAddress,
  CrewCompanion,
  CrewLead,
  TenantRepository,
} from './tenants/tenantRepository.js';
export { getCrewLead, type GetCrewLeadDeps } from './tenants/getCrewLead.js';
export {
  updateCrewLead,
  type UpdateCrewLeadCommand,
  type UpdateCrewLeadDeps,
} from './tenants/updateCrewLead.js';
export { getCompany, type GetCompanyDeps } from './tenants/getCompany.js';
export {
  updateCompany,
  type UpdateCompanyCommand,
  type UpdateCompanyDeps,
} from './tenants/updateCompany.js';
export {
  passthroughUnitOfWork,
  type UnitOfWork,
  type AllocationRepositories,
} from './transaction/unitOfWork.js';
export {
  ApplicationError,
  NotFoundError,
  ForbiddenError,
  UnauthorizedError,
  BusinessRuleError,
  RequiredFieldError,
} from './errors.js';

// Clientes (CL-01)
export {
  registerCustomer,
  type RegisterCustomerCommand,
  type RegisterCustomerDeps,
  type AddressInput,
} from './customers/registerCustomer.js';
export {
  getCustomerFamily,
  type CustomerFamilyView,
  type GetCustomerFamilyDeps,
} from './customers/getCustomerFamily.js';
export {
  removeCompanion,
  type RemoveCompanionCommand,
  type RemoveCompanionDeps,
} from './customers/removeCompanion.js';
export {
  updateCustomer,
  type UpdateCustomerCommand,
  type UpdateCustomerDeps,
} from './customers/updateCustomer.js';
export {
  registerCompanion,
  type RegisterCompanionCommand,
  type RegisterCompanionDeps,
} from './customers/registerCompanion.js';
export {
  searchCustomers,
  type Family,
  type SearchCustomersDeps,
  type ListCustomersParams,
} from './customers/searchCustomers.js';
export type {
  CustomerRepository,
  CustomerRecord,
  CustomerSort,
  NewCustomer,
  Address,
} from './customers/customerRepository.js';
export { EMPTY_ADDRESS } from './customers/customerRepository.js';
export { DuplicateCpfError } from './customers/errors.js';

// Reorganização de vínculo familiar (CL-10)
export {
  moveToResponsible,
  type MoveToResponsibleCommand,
  type MoveToResponsibleDeps,
} from './customers/moveToResponsible.js';
export {
  promoteToResponsible,
  type PromoteToResponsibleCommand,
  type PromoteToResponsibleDeps,
} from './customers/promoteToResponsible.js';
export {
  mergeCustomers,
  type MergeCustomersCommand,
  type MergeCustomersDeps,
} from './customers/mergeCustomers.js';
export {
  getCustomerFile,
  type GetCustomerFileCommand,
  type GetCustomerFileDeps,
  type CustomerFile,
  type CustomerFileHeader,
  type CustomerFileExpedition,
  type CustomerFileCashback,
} from './customers/getCustomerFile.js';

// Veículos (CL-05)
export {
  saveVehicle,
  type SaveVehicleCommand,
  type SaveVehicleDeps,
} from './vehicles/saveVehicle.js';
export {
  listCustomerVehicles,
  type ListCustomerVehiclesDeps,
} from './vehicles/listCustomerVehicles.js';
export {
  updateVehicle,
  type UpdateVehicleCommand,
  type UpdateVehicleDeps,
} from './vehicles/updateVehicle.js';
export {
  listVehicleBrands,
  listVehicleModels,
  type VehicleCatalogDeps,
} from './vehicles/listVehicleCatalog.js';
export type {
  VehicleRepository,
  VehicleRecord,
  NewVehicle,
  VehicleBrandRecord,
  VehicleModelRecord,
  VehicleWithNames,
} from './vehicles/vehicleRepository.js';

// Roteiros (RO-01..03)
export { createItinerary, type CreateItineraryCommand } from './itineraries/createItinerary.js';
export { updateItinerary, type UpdateItineraryCommand } from './itineraries/updateItinerary.js';
export {
  setItineraryPhotos,
  type SetItineraryPhotosCommand,
  type ItineraryPhotoInput,
} from './itineraries/setItineraryPhotos.js';
export {
  addItineraryPriceVersion,
  type AddItineraryPriceVersionCommand,
} from './itineraries/addItineraryPriceVersion.js';
export {
  listItineraryPriceVersions,
  type ListItineraryPriceVersionsCommand,
} from './itineraries/listItineraryPriceVersions.js';
export {
  resolveItineraryPrices,
  type ResolveItineraryPricesCommand,
} from './itineraries/resolveItineraryPrices.js';
export type { ItineraryDeps, PriceInput } from './itineraries/priceInput.js';
export type {
  ItineraryRepository,
  ItineraryRecord,
  ItineraryPatch,
  ItineraryPhotoRecord,
  NewItinerary,
  NewItineraryPhoto,
  NewPriceVersion,
  PriceVersionRecord,
} from './itineraries/itineraryRepository.js';

// Agenda (AG-02/AG-03)
export {
  createScheduleEvent,
  type CreateScheduleEventCommand,
  type ScheduleDeps,
} from './schedule/createScheduleEvent.js';
export {
  updateScheduleEvent,
  type UpdateScheduleEventCommand,
  type UpdateScheduleEventDeps,
} from './schedule/updateScheduleEvent.js';
export {
  cancelGroup,
  type CancelGroupCommand,
  type CancelGroupDeps,
} from './schedule/cancelGroup.js';
export {
  deleteScheduleEvent,
  type DeleteScheduleEventCommand,
  type DeleteScheduleEventDeps,
} from './schedule/deleteScheduleEvent.js';
export type {
  ScheduleRepository,
  NewScheduleEvent,
  ScheduleEventRecord,
  ScheduleEventUpdate,
  NewGroup,
  GroupRecord,
  ScheduleEventWithGroup,
} from './schedule/scheduleRepository.js';

// Inscrições — alocação manual com snapshot (GR-03/IN-07/IN-18)
export {
  allocateBooking,
  type AllocateBookingCommand,
  type AllocateBookingDeps,
  type AllocatedBooking,
} from './bookings/allocateBooking.js';
export {
  allocateManualBooking,
  type AllocateManualBookingCommand,
  type AllocateManualBookingDeps,
  type AllocatedManualBooking,
} from './bookings/allocateManualBooking.js';
export {
  listEnrollmentRequests,
  type ListEnrollmentRequestsDeps,
} from './portal/listEnrollmentRequests.js';
export {
  requestSelfEnrollment,
  PORTAL_ENROLLMENT_KIND,
  type RequestSelfEnrollmentDeps,
  type RequestSelfEnrollmentCommand,
  type PortalEnrollmentPayload,
} from './portal/requestSelfEnrollment.js';
export {
  restoreBookingTablePrice,
  type RestoreBookingTablePriceCommand,
  type RestoreBookingTablePriceDeps,
  type RestoredBooking,
} from './bookings/restoreBookingTablePrice.js';
export {
  discountBookingTotal,
  type DiscountBookingTotalCommand,
  type DiscountBookingTotalDeps,
  type DiscountedBooking,
  type DiscountMode,
} from './bookings/discountBookingTotal.js';
export {
  confirmBookingManually,
  type ConfirmBookingManuallyCommand,
  type ConfirmBookingManuallyDeps,
} from './bookings/confirmBookingManually.js';
export {
  cancelBooking,
  type CancelBookingCommand,
  type CancelBookingDeps,
} from './bookings/cancelBooking.js';
export {
  markBookingInvoice,
  type MarkBookingInvoiceCommand,
  type MarkBookingInvoiceDeps,
} from './bookings/markBookingInvoice.js';
export {
  checkInBooking,
  checkInBlockMessage,
  type CheckInBookingCommand,
  type CheckInBookingDeps,
} from './bookings/checkInBooking.js';
export {
  undoCheckIn,
  type UndoCheckInCommand,
  type UndoCheckInDeps,
} from './bookings/undoCheckIn.js';
export {
  buildGroupRoomlist,
  type BuildGroupRoomlistCommand,
  type BuildGroupRoomlistDeps,
  type GroupRoomlistView,
} from './bookings/buildGroupRoomlist.js';
export {
  buildGroupInsuranceList,
  type BuildGroupInsuranceListCommand,
  type BuildGroupInsuranceListDeps,
  type GroupInsuranceView,
} from './bookings/buildGroupInsuranceList.js';
export {
  buildGroupConvoyList,
  type BuildGroupConvoyListCommand,
  type BuildGroupConvoyListDeps,
  type GroupConvoyView,
} from './bookings/buildGroupConvoyList.js';

// PG-01/02/03 — gateway de pagamento (ASAAS)
export type {
  PaymentIntegrationRepository,
  PaymentIntegrationRecord,
  NewPaymentIntegration,
  PaymentEnvironment,
} from './payments/paymentIntegrationRepository.js';
export type {
  PaymentChargeRepository,
  PaymentChargeRecord,
  NewPaymentCharge,
  ChargeSettlement,
} from './payments/paymentChargeRepository.js';
export type {
  PaymentGateway,
  GatewayCredentials,
  GatewayAccount,
  GatewayCharge,
  GatewayChargeInput,
  GatewayCustomerInput,
  GatewayQuote,
  GatewaySimulation,
  GatewaySettlement,
  SettlementRef,
} from './payments/paymentGateway.js';
export {
  connectPaymentProvider,
  ASAAS,
  type ConnectPaymentProviderCommand,
  type ConnectPaymentProviderDeps,
  type ConnectedIntegration,
  type ConnectedIntegrationWithSecret,
} from './payments/connectPaymentProvider.js';
export {
  listPaymentIntegrations,
  type ListPaymentIntegrationsDeps,
} from './payments/listPaymentIntegrations.js';
export {
  disconnectPaymentProvider,
  type DisconnectPaymentProviderCommand,
} from './payments/disconnectPaymentProvider.js';
export {
  createBookingCharge,
  type CreateBookingChargeCommand,
  type CreateBookingChargeDeps,
} from './payments/createBookingCharge.js';
export {
  updatePaymentFees,
  type UpdatePaymentFeesCommand,
  type UpdatePaymentFeesDeps,
} from './payments/updatePaymentFees.js';
export {
  quoteBookingCharge,
  type ChargeQuote,
  type QuoteBookingChargeCommand,
  type QuoteBookingChargeDeps,
} from './payments/quoteBookingCharge.js';
export {
  listBookingCharges,
  type BookingChargeView,
  type ListBookingChargesCommand,
} from './payments/listBookingCharges.js';
export {
  listRecentCharges,
  type ChargeReportRow,
  type ListRecentChargesCommand,
  type ListRecentChargesDeps,
} from './payments/listRecentCharges.js';
export {
  reconcileCharge,
  type ReconcileChargeCommand,
  type ReconcileChargeDeps,
} from './payments/reconcileCharge.js';
export {
  settleChargeFromWebhook,
  type SettleChargeFromWebhookCommand,
  type SettleChargeFromWebhookDeps,
  type WebhookOutcome,
} from './payments/settleChargeFromWebhook.js';
export {
  getGroupBoard,
  type GetGroupBoardCommand,
  type GetGroupBoardDeps,
  type GroupBoardView,
  type GroupBoardRow,
  type GroupBoardCoupon,
  type GroupBoardHeader,
  type GroupBoardTotals,
  type GroupBoardOccupancy,
} from './bookings/getGroupBoard.js';

// Recebimentos — IN-08/IN-09/GR-05
export {
  getIntakeDetail,
  type IntakeDetail,
  type GetIntakeDetailDeps,
} from './intake/getIntakeDetail.js';
export {
  listRecentBookings,
  type RecentBookingRow,
  type ListRecentBookingsDeps,
} from './bookings/listRecentBookings.js';
export {
  registerRefund,
  type RegisterRefundCommand,
  type RegisterRefundDeps,
  type RefundDestination,
} from './payments/registerRefund.js';
export {
  registerPayment,
  type RegisterPaymentCommand,
  type RegisterPaymentDeps,
  type RegisteredPayment,
} from './payments/registerPayment.js';
export {
  deletePayment,
  type DeletePaymentCommand,
  type DeletePaymentDeps,
  type DeletedPayment,
} from './payments/deletePayment.js';
export type {
  PaymentRepository,
  NewPayment,
  PaymentRecord,
  BookingConfirmation,
} from './payments/paymentRepository.js';

// Fornecedores + margem (FO-01 · GR-08/09/10)
export {
  createSupplier,
  type CreateSupplierCommand,
  type CreateSupplierDeps,
} from './suppliers/createSupplier.js';
export { updateSupplier, type UpdateSupplierCommand } from './suppliers/updateSupplier.js';
export {
  createSupplierCategory,
  type CreateSupplierCategoryCommand,
  type SupplierCategoryDeps,
} from './suppliers/createSupplierCategory.js';
export {
  renameSupplierCategory,
  type RenameSupplierCategoryCommand,
  type WriteSupplierCategoryDeps,
} from './suppliers/renameSupplierCategory.js';
export {
  deleteSupplierCategory,
  type DeleteSupplierCategoryCommand,
} from './suppliers/deleteSupplierCategory.js';
export { listSupplierCategories } from './suppliers/listSupplierCategories.js';
export {
  deleteSupplierExpense,
  type DeleteSupplierExpenseCommand,
  type DeleteSupplierExpenseDeps,
} from './suppliers/deleteSupplierExpense.js';
export {
  addSupplierExpense,
  type AddSupplierExpenseCommand,
  type AddSupplierExpenseDeps,
} from './suppliers/addSupplierExpense.js';
export {
  registerSupplierPayment,
  type RegisterSupplierPaymentCommand,
  type RegisterSupplierPaymentDeps,
} from './suppliers/registerSupplierPayment.js';
export {
  getGroupResult,
  type GetGroupResultCommand,
  type GetGroupResultDeps,
  type GroupResultView,
} from './suppliers/getGroupResult.js';
export {
  getFinancialReport,
  type GetFinancialReportDeps,
  type FinancialReportFilter,
  type FinancialReportRow,
  type FinancialReportTotals,
  type FinancialReportView,
} from './reports/getFinancialReport.js';
export {
  getExpensesByCategory,
  type ExpensesByCategoryRow,
  type ExpensesByCategoryTotals,
  type ExpensesByCategoryView,
  type GetExpensesByCategoryDeps,
} from './reports/getExpensesByCategory.js';
export { type ReportWindow } from './reports/reportWindow.js';
export {
  getDashboard,
  type GetDashboardDeps,
  type DashboardView,
  type UpcomingGroup,
} from './reports/getDashboard.js';
export { createPost, type CreatePostCommand } from './community/createPost.js';
export { deleteOwnPost } from './community/deleteOwnPost.js';
export { getCommunityFeed, type GetCommunityFeedCommand } from './community/getCommunityFeed.js';
export { togglePostLike } from './community/togglePostLike.js';
export { commentOnPost, type CommentOnPostCommand } from './community/commentOnPost.js';
export { reportContent, type ReportContentCommand } from './community/reportContent.js';
export {
  moderatePost,
  type ModeratePostCommand,
  type ModerationAction,
} from './community/moderatePost.js';
export { getModerationQueue } from './community/getModerationQueue.js';
export { resolveReport, type ResolveReportCommand } from './community/resolveReport.js';
export { setPostHighlight, type SetPostHighlightCommand } from './community/setPostHighlight.js';
export { getMediaConsents, type MediaConsentState } from './communications/getMediaConsents.js';
export { setMediaConsent, type SetMediaConsentCommand } from './communications/setMediaConsent.js';
export type {
  MediaConsentRepository,
  MediaScope,
  GrantMediaConsentInput,
} from './communications/mediaConsentRepository.js';
export type {
  CommunityRepository,
  NewPost,
  NewPostMedia,
  PostRecord,
  PostMediaRecord,
  FeedQuery,
  NewComment,
  CommentRecord,
  NewReport,
  ReportQueueItem,
  ReportDecision,
} from './community/communityRepository.js';
export {
  listGroupExpenses,
  type ListGroupExpensesCommand,
  type ListGroupExpensesDeps,
  type GroupExpenseRow,
} from './suppliers/listGroupExpenses.js';
export {
  getSupplierFile,
  type GetSupplierFileCommand,
  type GetSupplierFileDeps,
  type SupplierFile,
  type SupplierFileHeader,
  type SupplierFileSaida,
  type SupplierFilePayment,
  type SupplierFileTotals,
} from './suppliers/getSupplierFile.js';
export type {
  SupplierRepository,
  NewSupplier,
  SupplierRecord,
  SupplierPatch,
  NewSupplierCategory,
  SupplierCategoryRecord,
  NewSupplierExpense,
  SupplierExpenseRecord,
  NewSupplierPayment,
  SupplierPaymentRecord,
} from './suppliers/supplierRepository.js';

// Webhook — receptor + fila (§5.7)
export {
  receiveIntake,
  type ReceiveIntakeCommand,
  type ReceiveIntakeDeps,
  type ReceivedIntake,
} from './intake/receiveIntake.js';
export {
  allocateFromQueue,
  type AllocateFromQueueCommand,
  type AllocateFromQueueDeps,
  type AllocatedFromQueue,
} from './intake/allocateFromQueue.js';
export {
  discardIntake,
  type DiscardIntakeCommand,
  type DiscardIntakeDeps,
} from './intake/discardIntake.js';
export {
  reprocessIntake,
  type ReprocessIntakeCommand,
  type ReprocessIntakeDeps,
  type ReprocessedIntake,
} from './intake/reprocessIntake.js';
export {
  type FormMappingRecord,
  type FormMappingRepository,
} from './intake/formMappingRepository.js';
export {
  setFormMapping,
  type SetFormMappingCommand,
  type SetFormMappingDeps,
} from './intake/setFormMapping.js';
export {
  listFormMappings,
  type EnrichedFormMapping,
  type ListFormMappingsDeps,
} from './intake/listFormMappings.js';
export {
  removeFormMapping,
  type RemoveFormMappingCommand,
  type RemoveFormMappingDeps,
} from './intake/removeFormMapping.js';
export {
  listAllocationQueue,
  nextOpenGroup,
  type AllocationQueueItem,
  type ListAllocationQueueDeps,
} from './intake/listAllocationQueue.js';
export {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  type CreateApiKeyCommand,
  type RevokeApiKeyCommand,
  type ManageApiKeysDeps,
} from './intake/manageApiKeys.js';
export { listOpenGroups, type ListOpenGroupsDeps } from './schedule/listOpenGroups.js';
export {
  listAgendaEvents,
  type AgendaEvent,
  type AgendaEventOccupancy,
  type ListAgendaEventsDeps,
} from './schedule/listAgendaEvents.js';
export {
  listOpenExpeditions,
  type OpenExpedition,
  type ListOpenExpeditionsDeps,
} from './schedule/listOpenExpeditions.js';
export {
  listPortalFamily,
  type FamilyMember,
  type ListPortalFamilyDeps,
} from './portal/listPortalFamily.js';
export { toQueueItem, type IntakeQueueCore } from './intake/queueItem.js';
export type {
  ApiKeyRepository,
  VerifiedApiKey,
  NewApiKey,
  ApiKeyRecord,
  CreatedApiKey,
  IntakeRepository,
  NewIntakeEvent,
  IntakeEventRecord,
  IntakeQueueItem,
  PortalRequestRecord,
  IntakeForAllocation,
  IntakeAllocation,
} from './intake/intakeRepository.js';
export type { OpenGroup } from './schedule/scheduleRepository.js';

// Cashback (§5.8 · CB-03..08)
export {
  accrueCashback,
  type AccrueCashbackCommand,
  type AccrueCashbackDeps,
  type AccruedCashback,
} from './cashback/accrueCashback.js';
export {
  redeemCashback,
  type RedeemCashbackCommand,
  type RedeemCashbackDeps,
  type RedeemedCashback,
} from './cashback/redeemCashback.js';
export {
  getCashbackStatement,
  type GetCashbackStatementCommand,
  type GetCashbackStatementDeps,
  type CashbackStatement,
} from './cashback/getCashbackStatement.js';
export {
  expireCashback,
  type ExpireCashbackDeps,
  type ExpiredCashback,
} from './cashback/expireCashback.js';
export {
  getCashbackConfig,
  updateCashbackConfig,
  type CashbackConfigDeps,
} from './cashback/manageCashbackConfig.js';
export {
  inviteTeamMember,
  type InviteTeamMemberCommand,
  type InviteTeamMemberDeps,
} from './team/inviteTeamMember.js';

// Portal — escrita do cliente (§3.7 / PC-06 / PC-08)
export {
  updateCustomerContact,
  type UpdateCustomerContactCommand,
  type UpdateCustomerContactDeps,
} from './portal/updateCustomerContact.js';
export {
  registerFamilyCompanion,
  type RegisterFamilyCompanionCommand,
  type RegisterFamilyCompanionDeps,
} from './portal/registerFamilyCompanion.js';
export { savePortalVehicle } from './portal/savePortalVehicle.js';
export {
  invitePortalCustomer,
  type InvitePortalCustomerCommand,
  type InvitePortalCustomerDeps,
} from './portal/invitePortalCustomer.js';

// Notificações ao cliente (PC-23)
export {
  notifyBooking,
  type NotifyBookingCommand,
  type NotifyBookingDeps,
} from './notifications/notifyBooking.js';
export type {
  NotificationGateway,
  BookingNotification,
} from './notifications/notificationGateway.js';

// Fila de aprovação de identidade (PC-07)
export {
  requestIdentityChange,
  type RequestIdentityChangeCommand,
  type RequestIdentityChangeDeps,
} from './identity/requestIdentityChange.js';
export {
  listIdentityChangeRequests,
  type ListIdentityChangeRequestsDeps,
  type EnrichedIdentityRequest,
} from './identity/listIdentityChangeRequests.js';
export {
  decideIdentityChange,
  type DecideIdentityChangeCommand,
  type DecideIdentityChangeDeps,
} from './identity/decideIdentityChange.js';
export type {
  IdentityChangeRepository,
  NewIdentityChangeRequest,
  IdentityChangeRequestRecord,
  IdentityDecision,
} from './identity/identityChangeRepository.js';
export {
  actorUserId,
  type AuditLogRepository,
  type NewAuditLogEntry,
  type AuditLogEntry,
} from './audit/auditLogRepository.js';
export { saveTermDraft, TERM_DOCUMENT_NAME } from './documents/saveTermDraft.js';
export type { SaveTermDraftDeps, SaveTermDraftCommand } from './documents/saveTermDraft.js';
export { publishTermVersion } from './documents/publishTermVersion.js';
export type {
  PublishTermVersionDeps,
  PublishTermVersionCommand,
} from './documents/publishTermVersion.js';
export { getTermAcceptanceStatus } from './documents/getTermAcceptanceStatus.js';
export type {
  GetTermAcceptanceStatusDeps,
  GetTermAcceptanceStatusCommand,
  TermAcceptanceStatus,
} from './documents/getTermAcceptanceStatus.js';
export { acceptTerm } from './documents/acceptTerm.js';
export type { AcceptTermDeps, AcceptTermCommand } from './documents/acceptTerm.js';
export { renderAcceptedTerm } from './documents/renderAcceptedTerm.js';
export type { RenderAcceptedTermDeps, RenderedTerm } from './documents/renderAcceptedTerm.js';
export { getTermEditorState } from './documents/getTermEditorState.js';
export type { GetTermEditorStateDeps, TermEditorState } from './documents/getTermEditorState.js';
export { getCommunicationConsents } from './communications/getCommunicationConsents.js';
export type {
  GetCommunicationConsentsDeps,
  CommunicationConsentState,
} from './communications/getCommunicationConsents.js';
export { setCommunicationConsent } from './communications/setCommunicationConsent.js';
export type {
  SetCommunicationConsentDeps,
  SetCommunicationConsentCommand,
} from './communications/setCommunicationConsent.js';
export type {
  CommunicationConsentRepository,
  ConsentChannel,
  GrantConsentInput,
} from './communications/communicationConsentRepository.js';
export type {
  LegalDocumentRepository,
  LegalDocumentRecord,
  DocumentVersionRecord,
  SaveDraftInput,
  PublishInput,
  AcceptanceInputRow,
  AcceptanceRecord,
  AcceptedTerm,
} from './documents/legalDocumentRepository.js';
export type {
  AuthAdminGateway,
  TeamInvite,
  PortalInvite,
  InvitedUser,
} from './team/authAdminGateway.js';
export type {
  CashbackRepository,
  NewCashbackEntry,
  CashbackEntryRecord,
  ExpiredCredit,
} from './cashback/cashbackRepository.js';
export type {
  BookingRepository,
  GroupBookingCounts,
  NewBooking,
  NewBookingParticipant,
  BookingRecord,
  BookingParticipantRecord,
  CashbackSnapshot,
  BookingDiscount,
  ParticipantPriceOverride,
  ParticipantTablePrice,
  ManualConfirmation,
  BookingCancellation,
  BookingInvoice,
} from './bookings/bookingRepository.js';
export { bookingSubtotal, bookingDiscount, bookingContracted } from './bookings/bookingTotals.js';

// Cupons de desconto (§5.15)
export {
  createCoupon,
  type CreateCouponCommand,
  type CreateCouponDeps,
} from './coupons/createCoupon.js';
export {
  updateCoupon,
  type UpdateCouponCommand,
  type UpdateCouponDeps,
} from './coupons/updateCoupon.js';
export { listCoupons, type CouponListItem, type ListCouponsDeps } from './coupons/listCoupons.js';
export {
  deleteCoupon,
  type DeleteCouponCommand,
  type DeleteCouponDeps,
} from './coupons/deleteCoupon.js';
export {
  applyCouponToBooking,
  type AppliedCoupon,
  type ApplyCouponToBookingCommand,
  type ApplyCouponToBookingDeps,
} from './coupons/applyCouponToBooking.js';
export {
  removeCouponFromBooking,
  type RemovedCoupon,
  type RemoveCouponFromBookingCommand,
  type RemoveCouponFromBookingDeps,
} from './coupons/removeCouponFromBooking.js';
export type {
  CouponRepository,
  CouponRecord,
  CouponPatch,
  CouponUses,
  NewCoupon,
  NewRedemption,
  RedemptionRecord,
} from './coupons/couponRepository.js';
