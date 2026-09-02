#!/usr/bin/env node
/**
 * Proíbe SQL cru no código de produção que fala com o banco.
 *
 * O servidor **não passa pela RLS**: o role do Prisma tem `BYPASSRLS`. Quem separa um
 * tenant do outro nessa via é a Prisma Client Extension (`tenantClient.ts`), que injeta
 * `tenantId` em toda operação — e que já falhou uma vez, com seis modelos fora da lista,
 * incluindo as credenciais do gateway de pagamento.
 *
 * Desde então há dois portões: `tenantScopeCoverage.test.ts` compara a lista com o schema,
 * e o `switch` de operações passou a **lançar** no `default` em vez de deixar passar. Os
 * dois cobrem tudo que atravessa a extension.
 *
 * Nada disso alcança SQL cru. `$queryRaw` e `$executeRaw` vão direto ao banco, sem
 * extension e sem RLS: uma consulta crua sem `WHERE tenant_id` lê a base inteira e nada
 * acusa. Hoje não existe nenhuma — este verificador é o que mantém assim.
 *
 * Teste é outra história: lá o SQL cru é a ferramenta certa (é como se monta e se inspeciona
 * o banco, e é assim que a suíte de RLS prova o isolamento). Por isso só o código de
 * produção é varrido.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..');
const SCAN_ROOTS = ['packages/infrastructure/src', 'packages/application/src', 'apps/server/src'];
const IGNORE_DIRS = new Set(['node_modules', 'dist', 'coverage', 'generated']);
const RAW = /\$(queryRaw|executeRaw|queryRawUnsafe|executeRawUnsafe|runCommandRaw)\b/;

const offenders = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (!full.endsWith('.ts') || /\.(test|fake)\.ts$/.test(full)) continue;
    readFileSync(full, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (RAW.test(line)) offenders.push(`${path.relative(ROOT, full)}:${i + 1}`);
      });
  }
}

for (const root of SCAN_ROOTS) walk(path.join(ROOT, root));

if (offenders.length > 0) {
  console.error('check:raw-sql FALHOU — SQL cru no código de produção:');
  for (const spot of offenders) console.error(`  · ${spot}`);
  console.error(
    '\nSQL cru não passa pela Prisma Client Extension e o role do Prisma ignora a RLS:\n' +
      'a consulta enxerga todos os tenants. Use o client escopado, ou traga a necessidade\n' +
      'para discussão antes de abrir exceção.',
  );
  process.exit(1);
}

console.log('check:raw-sql OK — nenhuma consulta crua fora dos testes.');
