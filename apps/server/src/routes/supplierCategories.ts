import {
  createSupplierCategory,
  deleteSupplierCategory,
  listSupplierCategories,
  renameSupplierCategory,
} from '@expedition/application';
import { z } from 'zod';
import type { SupplierCategoryRecord } from '@expedition/application';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ServerDeps } from '../buildServer.js';

/**
 * FO-04/FO-05 — o catálogo de categorias de fornecedor, que é a dimensão do relatório de
 * gastos por categoria.
 *
 * Arquivo próprio, e não junto de `suppliers.ts`: aquele já estava no teto de ~300 linhas
 * do `CLAUDE.md`, e categoria é outro recurso — tem ciclo de vida, dono e audiência
 * próprios, mesmo servindo ao fornecedor.
 */

const categoryBody = z.object({ name: z.string().trim().min(1) });
const categoryParams = z.object({ id: z.string().min(1) });

export function registerSupplierCategoryRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get('/v1/supplier-categories', async (request, reply) => {
    const ctx = await deps.resolveContext(request);
    const rows = await listSupplierCategories({ suppliers: deps.suppliers }, ctx);
    return reply.send(rows.map(categoryDto));
  });

  typed.post(
    '/v1/supplier-categories',
    { schema: { body: categoryBody } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const category = await createSupplierCategory(
        { suppliers: deps.suppliers, audit: deps.audit },
        ctx,
        { name: request.body.name },
      );
      return reply.status(201).send(categoryDto(category));
    },
  );

  typed.patch(
    '/v1/supplier-categories/:id',
    { schema: { params: categoryParams, body: categoryBody } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      const category = await renameSupplierCategory(
        { suppliers: deps.suppliers, audit: deps.audit },
        ctx,
        { id: request.params.id, name: request.body.name },
      );
      return reply.send(categoryDto(category));
    },
  );

  typed.delete(
    '/v1/supplier-categories/:id',
    { schema: { params: categoryParams } },
    async (request, reply) => {
      const ctx = await deps.resolveContext(request);
      await deleteSupplierCategory({ suppliers: deps.suppliers, audit: deps.audit }, ctx, {
        id: request.params.id,
      });
      return reply.status(204).send();
    },
  );
}

function categoryDto(category: SupplierCategoryRecord) {
  return { id: category.id, name: category.name };
}
