#!/usr/bin/env node
/**
 * Proíbe marcadores TODO/FIXME/XXX/HACK em código entregue (definição de pronto).
 *
 * Casa só o marcador em CAIXA ALTA como palavra isolada — em português "todo" é
 * palavra comum, então banir case-insensitive daria falso-positivo em toda prosa.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..');
const IGNORE_DIRS = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.git',
  'generated',
  '.pnpm-store',
]);
const SCAN_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.prisma', '.sql']);
const MARKER = /\b(TODO|FIXME|XXX|HACK)\b/;

const offenders = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
    } else if (full !== SELF && SCAN_EXT.has(path.extname(entry))) {
      const lines = readFileSync(full, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (MARKER.test(line)) offenders.push(`${path.relative(ROOT, full)}:${i + 1}`);
      });
    }
  }
}

walk(ROOT);

if (offenders.length > 0) {
  console.error('check:markers FALHOU — marcadores proibidos encontrados:');
  for (const spot of offenders) console.error(`  · ${spot}`);
  process.exit(1);
}

console.log('check:markers OK — nenhum TODO/FIXME/XXX/HACK.');
