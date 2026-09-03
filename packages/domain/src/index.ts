/**
 * @expedition/domain — regras de negócio puras.
 *
 * Zero I/O, zero Prisma, zero React. Se algo aqui precisar de banco para ser
 * testado, a fronteira foi violada (§10.1). Este pacote é importável tanto pelo
 * servidor quanto pelo portal (o cálculo de preço ao vivo do PC-16 usa as MESMAS
 * funções que o back-office), então não pode arrastar dependência de plataforma.
 */

// Primitivas monetárias
export {
  type Cents,
  cents,
  zeroCents,
  addCents,
  subCents,
  sumCents,
  applyPercent,
  applyPercentFloor,
  formatBRL,
  InvalidCentsError,
} from './money/cents.js';

// Primitivas de data civil
export {
  type LocalDate,
  parseLocalDate,
  formatLocalDateBR,
  fullYearsBetween,
  InvalidLocalDateError,
} from './date/localDate.js';

// Nome de pessoa (CL-01)
export { normalizePersonName } from './person/name.js';

// Telefone (E.164, §3.2)
export { parsePhone, isValidPhone, formatPhone, InvalidPhoneError } from './contact/phone.js';
export { phoneVariants } from './contact/phoneVariants.js';

// §5.18 — automações
export {
  validateGraph,
  nextNode,
  portsOf,
  type AutomationGraph,
  type AutomationNode,
  type AutomationEdge,
  type NodeKind,
  type Port,
  type GraphProblem,
} from './automation/graph.js';
export { renderTemplate } from './automation/renderTemplate.js';
export {
  evaluateCondition,
  readPath,
  resolveDelay,
  resolveSwitch,
  switchCases,
  minutosDaEspera,
  ESPERA_MINIMA_MIN,
  type RunContext,
  type SwitchCase,
} from './automation/interpreter.js';
export { INTERVALO_MINIMO_MIN, intervaloEmMinutos, janelaDe } from './automation/recurring.js';
export {
  CAMPOS_DA_BUSCA,
  CAMPOS_DO_GATILHO,
  contextFieldsFor,
  searchFieldsFor,
  TRIGGER_TYPES,
  type ContextField,
  type TriggerType,
} from './automation/triggers.js';
export {
  parsePixKey,
  isValidPixKey,
  formatPixKey,
  maskPixKey,
  InvalidPixKeyError,
  type PixKey,
  type PixKeyType,
} from './contact/pixKey.js';

// Identidade
export {
  type Cpf,
  parseCpf,
  isValidCpf,
  formatCpf,
  maskCpf,
  InvalidCpfError,
} from './identity/cpf.js';
export {
  type Cnpj,
  parseCnpj,
  isValidCnpj,
  formatCnpj,
  InvalidCnpjError,
} from './identity/cnpj.js';
export {
  parseCompanyLogo,
  logoImageFormat,
  InvalidCompanyLogoError,
  LOGO_MAX_BYTES,
  type LogoFormat,
} from './identity/companyLogo.js';

// Veículo
export {
  type Plate,
  parsePlate,
  isValidPlate,
  formatPlate,
  InvalidPlateError,
} from './vehicle/plate.js';
export { describeVehicle, type VehicleNames } from './vehicle/describeVehicle.js';

// Endereço
export { normalizeCep, isValidCep, formatCep } from './address/cep.js';

// Precificação (§3.4)
export {
  resolvePriceCategory,
  calculateBookingTotal,
  priceParticipants,
  priceBooking,
  resolveApplicablePrice,
  type AgeBand,
  type PriceCategory,
  type AgeBands,
  type PriceTable,
  type ParticipantPrice,
  type BookingParticipantInput,
  type BookingParticipantSnapshot,
  type BookingPricing,
  type PriceVersion,
} from './pricing/pricing.js';
export { contractedTotal } from './pricing/contractedTotal.js';
export { distributeDiscount, discountFromPercent } from './pricing/distributeDiscount.js';

// Cupom de desconto (§5.15)
export {
  normalizeCouponCode,
  checkCoupon,
  calculateCouponDiscount,
  InvalidCouponCodeError,
  type Coupon,
  type CouponMode,
  type CouponUsageContext,
  type CouponCheck,
  type CouponRejection,
} from './coupon/coupon.js';

export { compareLocalDate, addDays, addMonths } from './date/localDate.js';

// Leitura do grupo — Tabela 1 (§5.5, GR-07/GR-13)
export {
  summarizeGroupBoard,
  type GroupBoardBookingInput,
  type GroupBoardBookingLine,
  type GroupBoardSummary,
} from './group/groupBoard.js';
export { computeGroupResult, type GroupResult } from './group/groupResult.js';

// Roomlist do grupo (GR-15) — o documento do hotel
export {
  buildRoomlist,
  formatRoomlistAddress,
  type RoomlistAddress,
  type RoomlistEntry,
  type RoomlistGuest,
  type RoomlistInput,
  type RoomlistParty,
} from './group/roomlist.js';

// Lista do seguro (GR-16)
export {
  buildInsuranceList,
  formatInsurancePhone,
  type InsurancePerson,
  type InsuranceRow,
} from './group/insuranceList.js';

// Lista do comboio (GR-17)
export {
  buildConvoyList,
  type ConvoyEntry,
  type ConvoyInput,
  type ConvoyRow,
} from './group/convoyList.js';

// Gateway de pagamento (PG-01) — o webhook do provedor vira fato daqui
export { mapAsaasEvent, type AsaasEvent, type AsaasChargeStatus } from './payments/asaasEvent.js';
export {
  grossUpAmount,
  netOfFee,
  effectiveFee,
  ImpossibleFeeError,
  DEFAULT_SETTLEMENT_CYCLE_DAYS,
  type FeeRate,
  type EffectiveFee,
  type FeeSettings,
  type ProviderQuote,
} from './payments/grossUp.js';

// Check-in da inscrição (GR-14)
export {
  checkInAvailability,
  type CheckInAudience,
  type CheckInAvailability,
  type CheckInBlock,
  type CheckInState,
} from './group/checkIn.js';

// Cashback (§5.8) — a 5ª função-coração
export {
  calculateCashback,
  resolveCashbackRule,
  cashbackAppliesToSource,
  BOOKING_SOURCE,
  type BookingSource,
  type CashbackConfig,
  type CashbackRule,
  type CashbackOverride,
  type CashbackMode,
  type CashbackBase,
} from './cashback/cashback.js';
export { availableCashback, type CashbackLedgerEntry } from './cashback/availableCashback.js';

// Termo de adesão (§5.13) — núcleo puro de (re)aceite e renderização de variáveis
export {
  resolveAcceptanceRequirement,
  renderTermTemplate,
  type PublishedVersion,
  type AcceptanceInput,
  type AcceptanceRequirement,
  type TermVariables,
} from './documents/termAcceptance.js';
export { renderMarkdownToSafeHtml } from './documents/markdownTerm.js';
export { escapeHtml } from './documents/markdownTerm.js';
export { resolveTermVariables, type TermVariableSource } from './documents/termVariables.js';

// Webhook — perfil de mapeamento wp_flat_v1 (§5.7.1)
export {
  mapWpFlatPayload,
  readWpFlatIdentity,
  IntakeValidationError,
  type MappedIntake,
  type MappedResponsible,
  type MappedAddress,
  type MappedVehicle,
  type MappedCompanion,
} from './intake/mapWpFlatPayload.js';

// Webhook — schema público do formulário (§5.7.1 · IN-24)
export {
  coreFormSchema,
  type FormSchema,
  type FormFieldDef,
  type FormFieldType,
} from './intake/formSchema.js';

// Webhook — perfil de mapeamento canonical_v1 (§5.7.1 · IN-01b)
export { mapCanonicalV1Payload, readCanonicalV1Identity } from './intake/mapCanonicalV1Payload.js';

// Webhook — divergência de dados na alocação (§5.7.2 · IN-04)
export {
  detectCustomerDivergence,
  hasDivergence,
  type CustomerFacts,
  type CustomerDivergence,
} from './intake/detectCustomerDivergence.js';

// Comunidade — regras de conteúdo (§5.12 · CO-01/CO-04)
export {
  validatePostContent,
  validateComment,
  extractHashtags,
  normalizePostLayout,
  POST_LAYOUTS,
  PostValidationError,
  MAX_MEDIA,
  MAX_CAPTION,
  MAX_COMMENT,
  type PostValidationCode,
  type PostLayout,
} from './community/post.js';
export { searchKey } from './text/searchKey.js';

// §5.17 — atendimento
export {
  mapEvolutionEvent,
  stripMediaBytes,
  type EvolutionEvent,
  type EvolutionMedia,
} from './messaging/evolutionEvent.js';
export { ipIsAllowed, parseAllowedIps, InvalidIpError } from './messaging/allowedIp.js';
