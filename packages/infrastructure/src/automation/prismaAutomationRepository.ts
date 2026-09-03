import type {
  AutomationPatch,
  AutomationRecord,
  AutomationRepository,
  NewAutomation,
  TimeTriggerRef,
  TriggerType,
} from '@expedition/application';
import type { AutomationGraph } from '@expedition/domain';
import type { Prisma } from '../generated/prisma/client.js';
import type { Automation as PrismaAutomation } from '../generated/prisma/client.js';
import type { PrismaClient } from '../prisma/client.js';
import { tenantClient } from '../prisma/tenantClient.js';

/**
 * §5.18 — as automações no banco.
 *
 * O grafo entra e sai como `jsonb`: quem valida é o domínio, e quem guarda não opina sobre a
 * forma. `deletedAt` filtra em toda leitura — a exclusão é lógica porque o que a automação já
 * fez deixou rastro em conversa e em ficha, e o "por quê" precisa continuar existindo.
 */
export function prismaAutomationRepository(base: PrismaClient): AutomationRepository {
  const vivas = { deletedAt: null };

  return {
    async list(tenantId: string): Promise<AutomationRecord[]> {
      const rows = await tenantClient(base, tenantId).automation.findMany({
        where: vivas,
        orderBy: [{ name: 'asc' }],
      });
      return rows.map(toRecord);
    },

    async findById(tenantId: string, id: string): Promise<AutomationRecord | null> {
      const row = await tenantClient(base, tenantId).automation.findFirst({
        where: { id, ...vivas },
      });
      return row ? toRecord(row) : null;
    },

    async findByName(tenantId: string, name: string): Promise<AutomationRecord | null> {
      const row = await tenantClient(base, tenantId).automation.findFirst({
        // Sem caixa: "Follow-up" e "follow-up" são o mesmo nome para quem lê a lista.
        where: { name: { equals: name, mode: 'insensitive' }, ...vivas },
      });
      return row ? toRecord(row) : null;
    },

    async create(automation: NewAutomation): Promise<AutomationRecord> {
      const row = await tenantClient(base, automation.tenantId).automation.create({
        data: {
          tenantId: automation.tenantId,
          name: automation.name,
          description: automation.description,
          graph: automation.graph as unknown as Prisma.InputJsonValue,
          createdBy: automation.createdBy,
        },
      });
      return toRecord(row);
    },

    async update(tenantId: string, id: string, patch: AutomationPatch): Promise<AutomationRecord> {
      const row = await tenantClient(base, tenantId).automation.update({
        where: { id },
        data: {
          ...(patch.name === undefined ? {} : { name: patch.name }),
          ...(patch.description === undefined ? {} : { description: patch.description }),
          // AU-14: chega junto com o desenho, derivado do bloco de gatilho.
          ...(patch.triggerType === undefined ? {} : { triggerType: patch.triggerType }),
          ...(patch.triggerConfig === undefined
            ? {}
            : { triggerConfig: patch.triggerConfig as Prisma.InputJsonValue }),
          ...(patch.graph === undefined
            ? {}
            : { graph: patch.graph as unknown as Prisma.InputJsonValue }),
          ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
          ...(patch.runAsUserId === undefined ? {} : { runAsUserId: patch.runAsUserId }),
        },
      });
      return toRecord(row);
    },

    /**
     * AU-12 · AU-17 — o achado **sem escopo de tenant**, e um dos dois do sistema inteiro.
     *
     * O motor roda fora de requisição: não há tenant no contexto, e ele precisa saber em quais
     * tenants existe automação de tempo ligada. Por isso usa o client cru, de propósito — e
     * seleciona **só** id, tenant, o tipo do gatilho e a configuração dele. Ler a agenda de
     * cada tenant continua sendo pelo client escopado, dentro da varredura.
     *
     * Os dois gatilhos de tempo vêm juntos, num achado só: um segundo caminho cru seria mais
     * uma porta lateral para vigiar, e o filtro por tipo é barato de fazer na varredura.
     *
     * O `select` explícito é a parte que importa: sem ele, este caminho viraria uma porta por
     * onde dado de qualquer tenant sairia sem filtro.
     */
    async listTimeTriggersAcrossTenants(): Promise<readonly TimeTriggerRef[]> {
      const rows = await base.automation.findMany({
        where: { enabled: true, deletedAt: null, triggerType: { in: ['scheduled', 'recurring'] } },
        select: { id: true, tenantId: true, triggerType: true, triggerConfig: true },
      });
      return rows.map((row) => ({
        tenantId: row.tenantId,
        automationId: row.id,
        triggerType: row.triggerType as TriggerType,
        triggerConfig: (row.triggerConfig ?? {}) as Record<string, unknown>,
      }));
    },

    async softDelete(tenantId: string, id: string): Promise<void> {
      await tenantClient(base, tenantId).automation.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    },
  };
}

function toRecord(row: PrismaAutomation): AutomationRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    triggerType: row.triggerType as TriggerType | null,
    triggerConfig: (row.triggerConfig ?? {}) as Record<string, unknown>,
    graph: row.graph as unknown as AutomationGraph,
    enabled: row.enabled,
    runAsUserId: row.runAsUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
