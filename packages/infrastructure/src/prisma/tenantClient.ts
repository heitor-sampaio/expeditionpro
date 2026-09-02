import { NotFoundError } from '@expedition/application';
import type { PrismaClient } from '../generated/prisma/client.js';

/**
 * Escopo de tenant em TODA operação do Prisma (§2.2).
 *
 * Necessário porque o role do Prisma tem BYPASSRLS: a policy não é avaliada por
 * essa via, então o filtro tem que vir daqui. É o guarda de aplicação do risco nº 1
 * (Prisma furando isolamento de tenant). Junto com a RLS, são as duas camadas.
 *
 * `tenantClient` tem dois modos, com a MESMA semântica (`scopeOperation`):
 *   · client normal → Prisma Client Extension (`$extends`), um por requisição
 *   · client de transação interativa (sem `$extends`) → proxy que escopa cada
 *     operação **na própria `tx`** (UnitOfWork, `prismaUnitOfWork`). Sem o proxy,
 *     as ramificações update/delete/upsert/findUnique da extension agem pelo
 *     delegate do client original e **escapariam da transação** — quebrando a
 *     atomicidade da alocação (§5.7.2).
 *
 * Cobertura por operação:
 *   · reads com where livre (findFirst/findMany/count/aggregate/groupBy) → injeta where
 *   · findUnique/findUniqueOrThrow → reescreve para findFirst escopado (o where único
 *     por id não aceita filtro extra; por id sem tenant cruzaria fronteira)
 *   · create/createMany → injeta tenant no data
 *   · update/delete → verifica posse escopada e age por id (fidelidade do retorno)
 *   · updateMany/deleteMany → injeta where
 *   · upsert → resolve posse e vira update ou create escopado
 */

export const SCOPED_BY_TENANT_ID = new Set([
  'Membership',
  'Customer',
  'VehicleBrand',
  'VehicleModel',
  'Vehicle',
  'Itinerary',
  'ItineraryPrice',
  'ScheduleEvent',
  'Group',
  'Booking',
  'BookingParticipant',
  'BookingPayment',
  'Supplier',
  'SupplierExpense',
  'SupplierPayment',
  'ApiKey',
  'IntakeEvent',
  'FormMapping',
  'CashbackEntry',
  'IdentityChangeRequest',
  'AuditLog',
  'LegalDocument',
  'LegalDocumentVersion',
  'DocumentAcceptance',
  'CommunicationConsent',
  'Post',
  'PostComment',
  'PostReport',
  'PostLike',
  'MediaConsent',
  // Somados em 2026-09-01: estavam fora da lista e por isso cruzavam tenant em toda
  // leitura e escrita pelo servidor. Ver tenantScopeCoverage.test.ts, que agora impede.
  'ItineraryPhoto',
  'Coupon',
  'CouponRedemption',
  'SupplierCategory',
  'PaymentIntegration',
  'PaymentCharge',
  // §5.16 — o funil. Entram na lista como qualquer tabela de negócio: sem isso, a extension
  // deixa passar cru e o quadro de um tenant mostraria oportunidade de outro.
  'OpportunityStage',
  'Opportunity',
  // §5.17 — atendimento.
  'ChannelIntegration',
  'Conversation',
  'Message',
]);
export const SCOPED_BY_ID = new Set(['Tenant']);

function isScoped(model: string): boolean {
  return SCOPED_BY_TENANT_ID.has(model) || SCOPED_BY_ID.has(model);
}

type Args = Record<string, unknown>;

function scopeWhere(model: string, where: unknown, tenantId: string): Args {
  const base = (where as Args | undefined) ?? {};
  return SCOPED_BY_ID.has(model) ? { ...base, id: tenantId } : { ...base, tenantId };
}

function scopeData(model: string, data: unknown, tenantId: string): unknown {
  if (SCOPED_BY_ID.has(model)) return data;
  if (Array.isArray(data)) return data.map((row: Args) => ({ ...row, tenantId }));
  return { ...(data as Args), tenantId };
}

function delegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

function modelFromDelegate(delegate: string): string {
  return delegate.charAt(0).toUpperCase() + delegate.slice(1);
}

interface DelegateLike {
  findFirst(args: Args): Promise<{ id: string } | null>;
  update(args: Args): Promise<unknown>;
  delete(args: Args): Promise<unknown>;
  create(args: Args): Promise<unknown>;
  [operation: string]: (args: Args) => Promise<unknown>;
}

/**
 * O coração do escopo, compartilhado pela extension e pelo proxy de transação.
 * `delegate` é onde as operações auxiliares (findFirst de posse, update/delete/create
 * por id) rodam — no client normal é o delegate do próprio client; na transação é o
 * delegate da `tx`, garantindo que a escrita fica dentro dela. `passthrough` executa a
 * MESMA operação já escopada (na extension é `query`; no proxy é `delegate[operation]`).
 */
async function scopeOperation(
  model: string,
  operation: string,
  args: Args,
  tenantId: string,
  delegate: DelegateLike,
  passthrough: (args: Args) => Promise<unknown>,
): Promise<unknown> {
  switch (operation) {
    case 'findFirst':
    case 'findFirstOrThrow':
    case 'findMany':
    case 'count':
    case 'aggregate':
    case 'groupBy':
    case 'updateMany':
    case 'deleteMany':
      args['where'] = scopeWhere(model, args['where'], tenantId);
      return passthrough(args);

    case 'findUnique':
    case 'findUniqueOrThrow': {
      const row = await delegate.findFirst({
        ...args,
        where: scopeWhere(model, args['where'], tenantId),
      });
      if (!row && operation === 'findUniqueOrThrow') throw new NotFoundError(model);
      return row;
    }

    case 'create':
    case 'createMany':
    case 'createManyAndReturn':
      args['data'] = scopeData(model, args['data'], tenantId);
      return passthrough(args);

    case 'update':
    case 'delete': {
      const target = await delegate.findFirst({
        where: scopeWhere(model, args['where'], tenantId),
        select: { id: true },
      });
      if (!target) throw new NotFoundError(model);
      return delegate[operation]!({ ...args, where: { id: target.id } });
    }

    case 'upsert': {
      const target = await delegate.findFirst({
        where: scopeWhere(model, args['where'], tenantId),
        select: { id: true },
      });
      if (target) {
        return delegate.update({
          where: { id: target.id },
          data: args['update'],
          ...pick(args, ['select', 'include']),
        });
      }
      return delegate.create({
        data: scopeData(model, args['create'], tenantId),
        ...pick(args, ['select', 'include']),
      });
    }

    /*
     * SEC-02: operação desconhecida em modelo escopado **não passa**. Antes daqui saía um
     * `passthrough`, o que significava que qualquer operação nova do Prisma (hoje
     * `updateManyAndReturn`, amanhã outra) atravessaria sem filtro de tenant, em silêncio.
     * Default inseguro é como um furo entra sem ninguém escrever uma linha de código.
     */
    default:
      throw new Error(
        `tenantClient: operação "${operation}" não escopada para "${model}". ` +
          'Adicione o tratamento em scopeOperation antes de usá-la.',
      );
  }
}

function hasExtends(base: PrismaClient): boolean {
  return typeof (base as unknown as { $extends?: unknown }).$extends === 'function';
}

export function tenantClient(base: PrismaClient, tenantId: string): TenantClient {
  return hasExtends(base)
    ? extensionClient(base, tenantId)
    : (scopedTransactionClient(base, tenantId) as unknown as TenantClient);
}

/** Modo normal: Prisma Client Extension. Um por requisição. */
function extensionClient(base: PrismaClient, tenantId: string) {
  const delegateFor = (model: string): DelegateLike =>
    (base as unknown as Record<string, DelegateLike>)[delegateName(model)]!;

  return base.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!isScoped(model)) return query(args);
          return scopeOperation(
            model,
            operation,
            (args ?? {}) as Args,
            tenantId,
            delegateFor(model),
            (a) => query(a),
          );
        },
      },
    },
  });
}

/**
 * Modo transação: proxy sobre o client interativo (`tx`). Cada delegate escopado é
 * envolvido para que TODA operação — inclusive update/delete/upsert — rode nos
 * delegates da própria `tx`, ficando dentro da transação. Delegate não escopado (ex.:
 * `tenant`, lido por id direto) passa cru.
 */
function scopedTransactionClient(tx: PrismaClient, tenantId: string): unknown {
  const raw = tx as unknown as Record<string, DelegateLike>;
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== 'string') return undefined;
        const delegate = raw[prop];
        if (delegate === undefined) return undefined;
        const model = modelFromDelegate(prop);
        if (!isScoped(model)) return delegate;
        return new Proxy(delegate, {
          get(_d, operation) {
            if (typeof operation !== 'string') return undefined;
            const fn = delegate[operation];
            if (typeof fn !== 'function') return fn;
            return (args: Args = {}) =>
              scopeOperation(model, operation, { ...args }, tenantId, delegate, (a) =>
                (delegate[operation] as (a: Args) => Promise<unknown>)(a),
              );
          },
        });
      },
    },
  );
}

/**
 * Roda `fn` numa transação interativa quando o client a suporta; senão (o client JÁ é
 * uma `tx` — caso do UnitOfWork) roda inline na transação corrente. Deixa um `create`
 * multi-passo atômico sem abrir transação aninhada (Prisma não permite).
 */
export async function runInTransaction<T>(
  base: PrismaClient,
  fn: (tx: PrismaClient) => Promise<T>,
): Promise<T> {
  const client = base as unknown as {
    $transaction?: (f: (c: unknown) => Promise<T>) => Promise<T>;
  };
  if (typeof client.$transaction === 'function') {
    return client.$transaction((c) => fn(c as unknown as PrismaClient));
  }
  return fn(base);
}

function pick(source: Args, keys: readonly string[]): Args {
  const out: Args = {};
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

export type TenantClient = ReturnType<typeof extensionClient>;
