import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { GroupConvoyView } from '@expedition/application';
import type { ConvoyRow, LocalDate } from '@expedition/domain';
import { toWinAnsi, withoutDates } from './roomlistPdf.js';
import { writeZip } from './insuranceXlsx.js';

/**
 * GR-17 — a lista do comboio, em PDF ou XLSX.
 *
 * Dois formatos porque servem a dois momentos: o PDF é para imprimir e ter na mão na
 * saída; o XLSX é para quem quer reordenar os carros ou anotar ao lado.
 *
 * Aqui a planilha é **montada do zero** — ao contrário do seguro (GR-16), que preenche o
 * modelo da corretora. Não há modelo de comboio: quem define o formato é a casa.
 */

const A4 = { width: 595.28, height: 841.89 } as const;
const MARGIN = 48;
const LINE = 18;

const INK = rgb(0.14, 0.14, 0.16);
const MUTED = rgb(0.54, 0.54, 0.59);
const RULE = rgb(0.82, 0.82, 0.86);

/** Colunas do documento, com a largura que cada uma ocupa no PDF. */
const COLUMNS = [
  { header: '#', width: 28, of: (row: ConvoyRow) => String(row.position).padStart(2, '0') },
  { header: 'CONDUTOR', width: 200, of: (row: ConvoyRow) => row.driver },
  { header: 'MARCA', width: 100, of: (row: ConvoyRow) => row.brand },
  { header: 'MODELO', width: 110, of: (row: ConvoyRow) => row.model },
  { header: 'PLACA', width: 90, of: (row: ConvoyRow) => row.plate },
] as const;

export function convoyFileName(
  groupName: string,
  startDate: LocalDate,
  format: 'pdf' | 'xlsx',
): string {
  const slug = withoutDates(groupName)
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .split('-')
    .filter((word) => word !== '')
    .slice(0, 6)
    .join('-');
  const pad = (value: number): string => String(value).padStart(2, '0');
  const date = `${String(startDate.year)}-${pad(startDate.month)}-${pad(startDate.day)}`;
  return `comboio-${slug}-${date}.${format}`;
}

export async function renderConvoyPdf(view: GroupConvoyView): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setCreationDate(view.generatedAt);
  doc.setModificationDate(view.generatedAt);
  doc.setTitle(toWinAnsi(`Comboio — ${withoutDates(view.group.name)}`));

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([A4.width, A4.height]);
  const cursor = { y: A4.height - MARGIN };

  write(page, cursor, view.company.name, bold, 11, MUTED);
  write(page, cursor, 'COMBOIO', bold, 20, INK);
  cursor.y -= 6;
  write(page, cursor, `Saída: ${withoutDates(view.group.name)}`, regular, 11, INK);
  write(page, cursor, plural(view.rows.length, 'veículo', 'veículos'), regular, 11, INK);
  cursor.y -= 8;

  drawRow(
    page,
    cursor,
    COLUMNS.map((column) => column.header),
    bold,
    MUTED,
  );
  rule(page, cursor);

  for (const row of view.rows) {
    if (cursor.y < MARGIN + LINE) {
      page = doc.addPage([A4.width, A4.height]);
      cursor.y = A4.height - MARGIN;
    }
    drawRow(
      page,
      cursor,
      COLUMNS.map((column) => column.of(row)),
      regular,
      INK,
    );
  }

  return doc.save();
}

export async function renderConvoyXlsx(view: GroupConvoyView): Promise<Uint8Array> {
  const parts = new Map<string, Buffer>();
  parts.set('[Content_Types].xml', Buffer.from(CONTENT_TYPES, 'utf8'));
  parts.set('_rels/.rels', Buffer.from(ROOT_RELS, 'utf8'));
  parts.set('xl/workbook.xml', Buffer.from(WORKBOOK, 'utf8'));
  parts.set('xl/_rels/workbook.xml.rels', Buffer.from(WORKBOOK_RELS, 'utf8'));
  parts.set('xl/styles.xml', Buffer.from(STYLES, 'utf8'));
  parts.set('xl/worksheets/sheet1.xml', Buffer.from(sheetXml(view.rows), 'utf8'));
  return Promise.resolve(writeZip(parts));
}

/** A planilha em si: cabeçalho na linha 1, um carro por linha a partir da 2. */
export function sheetXml(rows: readonly ConvoyRow[]): string {
  const header = COLUMNS.map(
    (column, index) =>
      `<c r="${letter(index)}1" s="1" t="inlineStr"><is><t>${column.header}</t></is></c>`,
  ).join('');

  const body = rows
    .map((row, line) => {
      const number = line + 2;
      // A posição vai como número para a planilha ordenar como número, não como texto.
      const cells = [`<c r="A${String(number)}"><v>${String(row.position)}</v></c>`];
      COLUMNS.slice(1).forEach((column, index) => {
        const ref = `${letter(index + 1)}${String(number)}`;
        cells.push(`<c r="${ref}" t="inlineStr"><is><t>${escapeXml(column.of(row))}</t></is></c>`);
      });
      return `<row r="${String(number)}">${cells.join('')}</row>`;
    })
    .join('');

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<cols>' +
    '<col min="1" max="1" width="5" customWidth="1"/>' +
    '<col min="2" max="2" width="32" customWidth="1"/>' +
    '<col min="3" max="4" width="18" customWidth="1"/>' +
    '<col min="5" max="5" width="14" customWidth="1"/>' +
    '</cols>' +
    `<sheetData><row r="1">${header}</row>${body}</sheetData>` +
    '</worksheet>'
  );
}

function drawRow(
  page: PDFPage,
  cursor: { y: number },
  values: readonly string[],
  font: PDFFont,
  color: ReturnType<typeof rgb>,
): void {
  let x = MARGIN;
  values.forEach((value, index) => {
    page.drawText(toWinAnsi(value), { x, y: cursor.y, size: 10, font, color });
    x += COLUMNS[index]?.width ?? 0;
  });
  cursor.y -= LINE;
}

function write(
  page: PDFPage,
  cursor: { y: number },
  text: string,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
): void {
  page.drawText(toWinAnsi(text), { x: MARGIN, y: cursor.y, size, font, color });
  cursor.y -= size + 4;
}

function rule(page: PDFPage, cursor: { y: number }): void {
  page.drawLine({
    start: { x: MARGIN, y: cursor.y + 10 },
    end: { x: A4.width - MARGIN, y: cursor.y + 10 },
    thickness: 0.5,
    color: RULE,
  });
}

function letter(index: number): string {
  return String.fromCharCode(65 + index);
}

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* As partes fixas de um xlsx mínimo. Um arquivo sem elas o Excel recusa como corrompido. */

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '</Types>';

const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '</Relationships>';

const WORKBOOK =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
  '<sheets><sheet name="Comboio" sheetId="1" r:id="rId1"/></sheets>' +
  '</workbook>';

const WORKBOOK_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '</Relationships>';

/** Dois estilos: o padrão e o negrito do cabeçalho. */
const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>' +
  '<borders count="1"><border/></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
  '</styleSheet>';
