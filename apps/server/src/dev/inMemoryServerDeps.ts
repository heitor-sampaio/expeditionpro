import { inMemoryCeps } from './inMemoryCeps.js';
import { asaasGateway } from '@expedition/infrastructure';
import type { RequestContext } from '@expedition/application';
import type { ServerDeps } from '../buildServer.js';
import { inMemoryAudit } from './inMemoryAudit.js';
import { inMemoryAutomations, inMemoryAutomationRuns } from './inMemoryAutomations.js';
import { inMemoryBookings } from './inMemoryBookings.js';
import { inMemoryCashback } from './inMemoryCashback.js';
import { inMemoryCommunity } from './inMemoryCommunity.js';
import { inMemoryConsents } from './inMemoryConsents.js';
import { inMemoryCoupons } from './inMemoryCoupons.js';
import { inMemoryCustomers } from './inMemoryCustomers.js';
import { inMemoryFormMappings } from './inMemoryFormMappings.js';
import { inMemoryIdentityChange } from './inMemoryIdentityChange.js';
import { inMemoryApiKeys, inMemoryIntake } from './inMemoryIntake.js';
import { inMemoryItineraries } from './inMemoryItineraries.js';
import { inMemoryLegalDocuments } from './inMemoryLegalDocuments.js';
import { inMemoryMediaConsents } from './inMemoryMediaConsents.js';
import { inMemoryMemberships } from './inMemoryMemberships.js';
import {
  inMemoryChannelIntegrations,
  inMemoryConversations,
  inMemoryMediaStore,
  inMemoryMessagingGateway,
} from './inMemoryMessaging.js';
import { inMemoryOpportunities } from './inMemoryOpportunities.js';
import { inMemoryPayments } from './inMemoryPayments.js';
import { inMemorySchedule } from './inMemorySchedule.js';
import { inMemorySuppliers } from './inMemorySuppliers.js';
import { inMemoryTenants } from './inMemoryTenants.js';
import { inMemoryPaymentCharges, inMemoryPaymentIntegrations } from './inMemoryPaymentGateway.js';
import { inMemoryVehicles } from './inMemoryVehicles.js';

/**
 * Um `ServerDeps` completo, em memória, para os testes de rota.
 *
 * Antes cada arquivo montava o literal inteiro à mão — 22 dependências — e eles foram
 * ficando para trás: `formMappings` e `tenants` entraram no `ServerDeps` e não entraram
 * em cinco literais; dois outros estavam dez dependências atrás. A suíte seguia verde
 * porque a rota testada não tocava no que faltava, e o erro só aparecia quando alguém
 * mexia perto.
 *
 * O `override` recebe as dependências que o teste realmente exercita — normalmente uma ou
 * duas, com estado que ele mesmo inspeciona depois. O resto vem completo por construção,
 * e uma dependência nova no `ServerDeps` passa a ser um lugar só para atualizar.
 */
export function inMemoryServerDeps(override: Partial<ServerDeps> = {}): ServerDeps {
  const bookings = override.bookings ?? inMemoryBookings();
  const itineraries = override.itineraries ?? inMemoryItineraries();
  const tenants = override.tenants ?? inMemoryTenants();
  return {
    customers: inMemoryCustomers(),
    vehicles: inMemoryVehicles(),
    itineraries,
    // IN-25: a agenda resolve o slug do roteiro no link público — precisa dos mesmos roteiros.
    schedule: inMemorySchedule(itineraries, tenants),
    // Determinístico de propósito: teste de rota que toca o ViaCEP de verdade falha quando a
    // internet oscila e passa a medir o serviço dos outros. Quem fala com ele é o main.ts.
    ceps: inMemoryCeps(),
    bookings,
    // O ledger de recebimentos lê as linhas de inscrição: precisa das mesmas, não de outras.
    payments: inMemoryPayments('rows' in bookings ? (bookings as { rows: never[] }).rows : []),
    suppliers: inMemorySuppliers(),
    apiKeys: inMemoryApiKeys([]),
    intake: inMemoryIntake(),
    formMappings: inMemoryFormMappings(),
    tenants,
    cashback: inMemoryCashback(),
    coupons: inMemoryCoupons(),
    identityRequests: inMemoryIdentityChange(),
    audit: inMemoryAudit(),
    memberships: inMemoryMemberships(),
    opportunities: inMemoryOpportunities(),
    channelIntegrations: inMemoryChannelIntegrations(),
    conversations: inMemoryConversations(),
    messagingGateway: inMemoryMessagingGateway(),
    conversationMedia: inMemoryMediaStore(),
    automations: inMemoryAutomations(),
    ...inMemoryAutomationRuns(),
    documents: inMemoryLegalDocuments(),
    consents: inMemoryConsents(),
    community: inMemoryCommunity(),
    media: inMemoryMediaConsents(),
    paymentIntegrations: inMemoryPaymentIntegrations(),
    charges: inMemoryPaymentCharges(),
    paymentGateway: asaasGateway(),
    resolveContext: (): Promise<RequestContext> => {
      throw new Error('inMemoryServerDeps: informe `resolveContext` no override.');
    },
    ...override,
  };
}
