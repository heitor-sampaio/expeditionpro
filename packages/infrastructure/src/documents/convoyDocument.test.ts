import { describe, expect, it } from 'vitest';
import { parseLocalDate } from '@expedition/domain';
import type { GroupConvoyView } from '@expedition/application';
import type { ConvoyRow } from '@expedition/domain';
import { convoyFileName, renderConvoyPdf, renderConvoyXlsx, sheetXml } from './convoyDocument.js';
import { readZip } from './insuranceXlsx.js';

/**
 * GR-17 — a lista do comboio em dois formatos. O PDF é para imprimir e colar no vidro; o
 * XLSX é para quem quer ordenar e mexer.
 */

function row(position: number, overrides: Partial<ConvoyRow> = {}): ConvoyRow {
  return {
    position,
    driver: `Condutor ${String(position)}`,
    brand: 'Jeep',
    model: 'Wrangler',
    plate: 'ABC1D23',
    ...overrides,
  };
}

function view(rows: readonly ConvoyRow[]): GroupConvoyView {
  return {
    company: { name: 'Drakkar Expedições', logo: null },
    group: { name: 'Coxilha Rica · 10/11/2026', startDate: parseLocalDate('2026-11-10') },
    rows,
    generatedAt: new Date('2026-08-31T12:00:00.000Z'),
  };
}

describe('GR-17: o PDF', () => {
  it('gera bytes de PDF válido', async () => {
    const bytes = await renderConvoyPdf(view([row(1), row(2)]));

    expect(Buffer.from(bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
  });

  it('é determinístico', async () => {
    const document = view([row(1)]);

    const first = await renderConvoyPdf(document);
    const second = await renderConvoyPdf(document);

    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });

  it('comboio vazio ainda gera um documento legível', async () => {
    const bytes = await renderConvoyPdf(view([]));

    expect(Buffer.from(bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
  });
});

describe('GR-17: o XLSX', () => {
  it('monta a planilha com cabeçalho e uma linha por carro', () => {
    const xml = sheetXml([row(1, { driver: 'Ana Lima' }), row(2, { driver: 'Beto Souza' })]);

    expect(xml).toContain('<is><t>CONDUTOR</t></is>');
    expect(xml).toContain('<is><t>PLACA</t></is>');
    expect(xml).toContain('<is><t>Ana Lima</t></is>');
    expect(xml).toContain('<is><t>Beto Souza</t></is>');
    // A posição é número, para a planilha ordenar como número.
    expect(xml).toContain('<c r="A2"><v>1</v></c>');
    expect(xml).toContain('<c r="A3"><v>2</v></c>');
  });

  it('escapa o que quebraria o XML', () => {
    const xml = sheetXml([row(1, { driver: 'Ana & João <Filho>' })]);

    expect(xml).toContain('<t>Ana &amp; João &lt;Filho&gt;</t>');
  });

  it('gera um xlsx que abre — zip com as partes obrigatórias', async () => {
    const bytes = await renderConvoyXlsx(view([row(1)]));
    const entries = readZip(Buffer.from(bytes));

    expect(Buffer.from(bytes.subarray(0, 2)).toString('latin1')).toBe('PK');
    for (const part of [
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/worksheets/sheet1.xml',
      'xl/styles.xml',
    ]) {
      expect(entries.has(part)).toBe(true);
    }
  });
});

describe('GR-17: o nome do arquivo', () => {
  it('diz comboio, a saída e a data, com a extensão do formato', () => {
    expect(convoyFileName('Coxilha Rica · 10/11/2026', parseLocalDate('2026-11-10'), 'pdf')).toBe(
      'comboio-coxilha-rica-2026-11-10.pdf',
    );
    expect(convoyFileName('Coxilha Rica · 10/11/2026', parseLocalDate('2026-11-10'), 'xlsx')).toBe(
      'comboio-coxilha-rica-2026-11-10.xlsx',
    );
  });
});
