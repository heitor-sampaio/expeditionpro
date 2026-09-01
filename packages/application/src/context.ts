/**
 * Contexto da requisição — quem está agindo e em qual tenant.
 *
 * É a única fonte de `tenantId` que a Prisma Client Extension lê para injetar o
 * filtro em todo find/create/update/delete (§2.2). Nasce na borda (autenticação do
 * JWT ou da API key) e desce pela aplicação. Nenhum caso de uso recebe `tenantId`
 * solto por parâmetro — ele vem sempre daqui, para não haver caminho que esqueça.
 */

export type TeamRole = 'owner' | 'admin' | 'operator' | 'viewer';

export type Actor =
  | { readonly kind: 'team'; readonly userId: string; readonly role: TeamRole }
  | { readonly kind: 'customer'; readonly customerId: string; readonly userId: string }
  | { readonly kind: 'integration'; readonly apiKeyId: string; readonly scopes: readonly string[] }
  | { readonly kind: 'system' };

export interface RequestContext {
  readonly tenantId: string;
  readonly actor: Actor;
}
