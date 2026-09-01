import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SCOPED_BY_TENANT_ID, SCOPED_BY_ID } from './tenantClient.js';

/**
 * SEC-02 — o portão que faltava.
 *
 * A defesa de isolamento tem duas camadas: a RLS do Postgres e a Prisma Client Extension.
 * O servidor **não passa pela RLS** — o role do Prisma tem `BYPASSRLS` —, então quem
 * protege ali é só a extension, e ela depende de uma lista escrita à mão.
 *
 * O `check:rls` cobra RLS em toda tabela nova e por isso a RLS está impecável: 38 de 38
 * tabelas com policy. Mas **nada cobrava a lista da extension**, e ela ficou seis modelos
 * atrás do schema — entre eles `PaymentIntegration` e `PaymentCharge`. Modelo de fora
 * passa cru: sem RLS naquela via e sem escopo, não sobrou camada nenhuma.
 *
 * Este teste é o portão. Ele lê o `schema.prisma` e exige que todo modelo com `tenantId`
 * esteja escopado. Corrigir os seis sem isto seria remendo: a próxima migration repetiria.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = path.resolve(HERE, '../../prisma/schema.prisma');

/** Modelos do schema que têm coluna `tenant_id`, e os que deliberadamente não têm. */
function modelosComTenantId(): { comTenant: string[]; semTenant: string[] } {
  const texto = readFileSync(SCHEMA, 'utf8');
  const comTenant: string[] = [];
  const semTenant: string[] = [];
  for (const bloco of texto.split(/\nmodel\s+/).slice(1)) {
    const nome = bloco.slice(0, bloco.indexOf(' ')).trim();
    const corpo = bloco.slice(bloco.indexOf('{') + 1, bloco.lastIndexOf('}'));
    if (/^\s*tenantId\s+/m.test(corpo)) comTenant.push(nome);
    else semTenant.push(nome);
  }
  return { comTenant, semTenant };
}

describe('SEC-02: todo modelo com tenantId é escopado pela Client Extension', () => {
  it('nenhum modelo com `tenantId` fica de fora da lista', () => {
    const { comTenant } = modelosComTenantId();
    const faltando = comTenant.filter((m) => !SCOPED_BY_TENANT_ID.has(m));

    /*
     * Se este teste falhar, a mensagem já diz o que fazer: o modelo listado tem coluna
     * `tenant_id` e não está em `SCOPED_BY_TENANT_ID`, então toda leitura e escrita dele
     * pelo servidor cruza a fronteira de tenant.
     */
    expect(faltando).toEqual([]);
  });

  it('a lista não tem modelo que não existe mais no schema', () => {
    const { comTenant, semTenant } = modelosComTenantId();
    const conhecidos = new Set([...comTenant, ...semTenant]);
    const fantasmas = [...SCOPED_BY_TENANT_ID, ...SCOPED_BY_ID].filter((m) => !conhecidos.has(m));

    // Lista com nome errado protege nada e dá falsa sensação de cobertura.
    expect(fantasmas).toEqual([]);
  });

  it('`Tenant` é escopado por id, não por tenantId — é a própria linha do tenant', () => {
    expect(SCOPED_BY_ID.has('Tenant')).toBe(true);
    expect(SCOPED_BY_TENANT_ID.has('Tenant')).toBe(false);
  });

  it('modelo sem tenantId fica de fora por desenho, e é filho de quem tem', () => {
    const { semTenant } = modelosComTenantId();
    // Hoje só `PostMedia` (filho de `Post`, escrito por nested write) e `Tenant`.
    expect(semTenant.filter((m) => m !== 'Tenant').sort()).toEqual(['PostMedia']);
  });
});
