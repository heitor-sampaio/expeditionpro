import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import type { GroupInsuranceView } from '@expedition/application';
import type { InsuranceRow, LocalDate } from '@expedition/domain';
import { withoutDates } from './roomlistPdf.js';

/**
 * GR-16 — a planilha do seguro.
 *
 * O modelo da seguradora é **preenchido, não recriado**. Ele traz validação de data na
 * coluna de nascimento, o formato que pontua o CPF e repõe o zero à esquerda, colunas
 * ocultas de conferência, a imagem do corretor e o texto de instrução. Refazer isso do
 * zero seria reconstruir, com risco de divergir, um arquivo que a seguradora já aceita.
 *
 * Daí o zip escrito à mão: entrando só no `sheet1.xml`, **todas as outras entradas
 * saem byte a byte como entraram**. Uma biblioteca de planilha reescreveria o arquivo
 * inteiro e é aí que imagem, comentário e validação se perdem.
 */

/** Primeira linha de dados do modelo — abaixo do cabeçalho, que está na 12. */
const FIRST_ROW = 13;

/** Colunas do modelo, na ordem: CPF, nome, nascimento, e-mail, telefone. */
const COLUMNS = { cpf: 'B', name: 'C', birth: 'D', email: 'E', phone: 'F' } as const;

/**
 * O Excel conta dias desde 1899-12-30 — a data é anterior a 1900-01-01 por causa do bug
 * do ano bissexto de 1900, que a planilha mantém por compatibilidade.
 */
const EPOCH = Date.UTC(1899, 11, 30);
const DAY_MS = 24 * 60 * 60 * 1000;

export function dateSerial(date: LocalDate): number {
  return Math.round((Date.UTC(date.year, date.month - 1, date.day) - EPOCH) / DAY_MS);
}

export async function renderInsuranceXlsx(view: GroupInsuranceView): Promise<Uint8Array> {
  const template = await readFile(templatePath());
  const entries = readZip(template);

  const sheetName = 'xl/worksheets/sheet1.xml';
  const sheet = entries.get(sheetName);
  if (!sheet) throw new Error('modelo do seguro sem a planilha principal');

  entries.set(
    sheetName,
    Buffer.from(fillInsuranceSheet(sheet.toString('utf8'), view.rows), 'utf8'),
  );
  return writeZip(entries);
}

/** Nome do arquivo, no mesmo padrão da roomlist: sem a data grudada no nome da saída. */
export function insuranceFileName(groupName: string, startDate: LocalDate): string {
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
  return `seguro-${slug}-${String(startDate.year)}-${pad(startDate.month)}-${pad(startDate.day)}.xlsx`;
}

/**
 * Escreve as linhas na planilha **editando as células que já existem**, preservando o
 * atributo de estilo de cada uma — o modelo é zebrado, e cada linha tem estilos próprios.
 * Reconstruir as linhas perderia isso.
 */
export function fillInsuranceSheet(xml: string, rows: readonly InsuranceRow[]): string {
  let filled = xml;

  rows.forEach((row, index) => {
    const line = FIRST_ROW + index;
    filled = setNumber(filled, `${COLUMNS.cpf}${String(line)}`, row.cpf);
    filled = setText(filled, `${COLUMNS.name}${String(line)}`, row.fullName);
    filled = setNumber(
      filled,
      `${COLUMNS.birth}${String(line)}`,
      String(dateSerial(row.birthDate)),
    );
    filled = setText(filled, `${COLUMNS.email}${String(line)}`, row.email);
    filled = setText(filled, `${COLUMNS.phone}${String(line)}`, row.phone);
  });

  return filled;
}

/** Célula numérica: CPF e data de nascimento, que a planilha formata pelo estilo. */
function setNumber(xml: string, ref: string, value: string): string {
  return replaceCell(xml, ref, (style) => `<c r="${ref}"${style}><v>${value}</v></c>`);
}

/**
 * Célula de texto como **string embutida**: assim o `sharedStrings.xml` do modelo não
 * precisa ser tocado, e nenhum índice de string existente muda de lugar.
 */
function setText(xml: string, ref: string, value: string): string {
  if (value === '') return xml;
  return replaceCell(
    xml,
    ref,
    (style) => `<c r="${ref}"${style} t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`,
  );
}

/** Troca a célula mantendo o `s=` do modelo. Célula ausente na linha é ignorada. */
function replaceCell(xml: string, ref: string, build: (style: string) => string): string {
  const pattern = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>.*?</c>)`, 's');
  const match = pattern.exec(xml);
  if (!match) return xml;
  const style = (match[1] ?? '').replace(/\s*t="[^"]*"/, '');
  return xml.replace(pattern, build(style.trimEnd()));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function templatePath(): string {
  return fileURLToPath(new URL('../../assets/seguro-template.xlsx', import.meta.url));
}

/* ------------------------------------------------------------------ *
 * Zip mínimo. Só o necessário para abrir um xlsx, trocar uma entrada e
 * fechar de novo — sem dependência, e sem tocar no que não foi pedido.
 * ------------------------------------------------------------------ */

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

export function readZip(buf: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  const central = Buffer.alloc(4);
  central.writeUInt32LE(CENTRAL_SIG);

  let i = buf.indexOf(central);
  while (i !== -1 && buf.readUInt32LE(i) === CENTRAL_SIG) {
    const method = buf.readUInt16LE(i + 10);
    const size = buf.readUInt32LE(i + 20);
    const nameLen = buf.readUInt16LE(i + 28);
    const extraLen = buf.readUInt16LE(i + 30);
    const commentLen = buf.readUInt16LE(i + 32);
    const offset = buf.readUInt32LE(i + 42);
    const name = buf.toString('utf8', i + 46, i + 46 + nameLen);

    const localNameLen = buf.readUInt16LE(offset + 26);
    const localExtraLen = buf.readUInt16LE(offset + 28);
    const start = offset + 30 + localNameLen + localExtraLen;
    const raw = buf.subarray(start, start + size);
    entries.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));

    i += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

export function writeZip(entries: Map<string, Buffer>): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const [name, content] of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = deflateRawSync(content);
    const crc = crc32(content);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_SIG, 0);
    local.writeUInt16LE(20, 4); // versão necessária
    local.writeUInt16LE(0, 6); // sem flags: nome em UTF-8 puro basta para o xlsx
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_SIG, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);

    locals.push(local, nameBuf, deflated);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + deflated.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(entries.size, 8);
  eocd.writeUInt16LE(entries.size, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBuf, eocd]);
}

let CRC_TABLE: Int32Array | null = null;

function crc32(buf: Buffer): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
