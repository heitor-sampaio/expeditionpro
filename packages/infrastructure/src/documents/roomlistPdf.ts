import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';
import {
  formatCnpj,
  isValidCnpj,
  logoImageFormat,
  parseCnpj,
  type LocalDate,
} from '@expedition/domain';
import type { CompanyInfo, GroupRoomlistView } from '@expedition/application';
import type { RoomlistEntry } from '@expedition/domain';

/**
 * GR-15 — a roomlist em PDF. Só formato: quem entra na lista e em que ordem já veio
 * decidido pelo caso de uso.
 *
 * A paginação é feita à mão de propósito. Uma lib com layout automático esconderia a
 * regra "registro não se parte no meio da página" num comportamento que não dá para
 * testar; aqui ela é uma função pura, com teste.
 */

const A4 = { width: 595.28, height: 841.89 } as const;
const MARGIN = 48;
const LINE = 14;
/** Linhas úteis por página, descontando cabeçalho e rodapé. */
const LINES_PER_PAGE = 44;

const INK = rgb(0.14, 0.14, 0.16);
const MUTED = rgb(0.54, 0.54, 0.59);
const RULE = rgb(0.82, 0.82, 0.86);

export interface PageOptions {
  readonly linesPerPage: number;
}

/**
 * Quebra os registros em páginas sem partir um registro ao meio. Um registro maior que
 * a página inteira ocupa uma página sozinho — melhor transbordar uma vez que travar.
 */
export function splitIntoPages(
  entries: readonly RoomlistEntry[],
  options: PageOptions,
): readonly (readonly RoomlistEntry[])[] {
  const pages: RoomlistEntry[][] = [[]];
  let used = 0;

  for (const entry of entries) {
    const height = linesOf(entry);
    const current = pages[pages.length - 1]!;
    if (current.length > 0 && used + height > options.linesPerPage) {
      pages.push([entry]);
      used = height;
      continue;
    }
    current.push(entry);
    used += height;
  }

  return pages;
}

/**
 * As fontes padrão do PDF falam WinAnsi, que cobre o português inteiro — mas `drawText`
 * **lança** em qualquer caractere fora dela. Um emoji colado num nome derrubaria a
 * geração da saída inteira, então o que a fonte não conhece vira `?`.
 */
export function toWinAnsi(text: string): string {
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    out += code <= 0xff || WIN_ANSI_EXTRA.has(char) ? char : '?';
  }
  return out;
}

/** Quantas palavras do nome da saída cabem no arquivo antes de virar ruído. */
const NAME_WORDS = 6;

/**
 * Datas escritas como se escreve no nome de uma saída: `10/11/2026`, `10-11-26`,
 * `05-07.09.26`, `2026-10-10`. Só isso — "Grupo 24" e "Trilha 4x4" não são data, e
 * apagar esses números deixaria duas saídas com o mesmo nome.
 */
const DATE_LIKE = /\b\d{1,4}([./-]\d{1,4}){1,3}\b/gu;

/**
 * O nome da saída como ele vai para o documento: **sem data**.
 *
 * O nome do grupo costuma terminar com a data de início ("Coxilha Rica · 10/11/2026"), e
 * a expedição nem sempre dorme no mesmo hotel a viagem inteira — data no papel que não é
 * a da estadia daquele hotel vira confusão na recepção. O período é combinado direto com
 * o hotel (decisão do dono do produto, 2026-08-31).
 */
export function withoutDates(text: string): string {
  return text
    .replace(DATE_LIKE, '')
    .replace(/[\s·•,–—-]+$/u, '')
    .trim();
}

/**
 * Nome do arquivo: sem acento, sem espaço, com a data da saída em ISO.
 *
 * A data fica **só aqui**, nunca no conteúdo: é o que ordena a pasta e separa duas saídas
 * do mesmo roteiro. O nome entra já sem a data grudada, senão o anexo a teria duas vezes.
 */
export function roomlistFileName(groupName: string, startDate: LocalDate): string {
  const slug = withoutDates(groupName)
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .split('-')
    .filter((word) => word !== '')
    .slice(0, NAME_WORDS)
    .join('-');
  const pad = (value: number): string => String(value).padStart(2, '0');
  const date = `${String(startDate.year)}-${pad(startDate.month)}-${pad(startDate.day)}`;
  return `roomlist-${slug}-${date}.pdf`;
}

export async function renderRoomlistPdf(view: GroupRoomlistView): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  // Datas injetadas: sem isso os bytes mudam a cada execução e nada disso é testável.
  doc.setCreationDate(view.generatedAt);
  doc.setModificationDate(view.generatedAt);
  // O leitor de PDF mostra o título na aba: aqui também nada de data (GR-15).
  doc.setTitle(toWinAnsi(`Roomlist — ${withoutDates(view.group.name)}`));

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedLogo(doc, view.company.logo);
  const pages = splitIntoPages(view.entries, { linesPerPage: LINES_PER_PAGE });

  pages.forEach((entries, index) => {
    const page = doc.addPage([A4.width, A4.height]);
    const cursor = { y: A4.height - MARGIN };

    if (index === 0) drawHeader(page, cursor, view, { regular, bold }, logo);
    for (const entry of entries) drawEntry(page, cursor, entry, { regular, bold });

    drawFooter(page, regular, index + 1, pages.length, view);
  });

  return doc.save();
}

interface Fonts {
  readonly regular: PDFFont;
  readonly bold: PDFFont;
}

/**
 * A identificação da empresa no topo. CNPJ inválido no cadastro sai **como está**: o
 * documento não é o lugar de descobrir que um campo foi mal preenchido meses atrás, e
 * a saída de amanhã não pode ficar sem roomlist por causa disso.
 */
export function companyLine(company: CompanyInfo): string {
  if (!company.cnpj) return company.name;
  const cnpj = isValidCnpj(company.cnpj) ? formatCnpj(parseCnpj(company.cnpj)) : company.cnpj;
  return `${company.name} — CNPJ ${cnpj}`;
}

/**
 * O que o cabeçalho diz, em ordem. **Nenhuma data da saída aparece aqui** (GR-15): a
 * expedição nem sempre dorme no mesmo hotel a viagem toda, e o período de cada hotel é
 * combinado direto com ele. O que o documento traz é quem chega e quantos são.
 */
export function headerLines(view: GroupRoomlistView): readonly string[] {
  return [
    companyLine(view.company),
    'ROOMLIST',
    `Saída: ${withoutDates(view.group.name)}`,
    `${plural(view.entries.length, 'registro', 'registros')} · ${plural(view.guestCount, 'hóspede', 'hóspedes')}`,
  ];
}

/** Altura máxima da logo no cabeçalho. A largura acompanha, preservando a proporção. */
const LOGO_HEIGHT = 38;
const LOGO_MAX_WIDTH = 150;

/**
 * CF-02 — embute a logo do tenant. Imagem quebrada **não derruba o documento**: o hotel
 * espera a lista, e uma logo corrompida não pode custar a saída inteira. Sem logo, ou
 * com logo ilegível, o cabeçalho é o mesmo de sempre.
 */
async function embedLogo(doc: PDFDocument, logo: string | null): Promise<PDFImage | null> {
  if (logo === null) return null;
  const base64 = logo.slice(logo.indexOf(',') + 1);
  try {
    return logoImageFormat(logo) === 'png'
      ? await doc.embedPng(base64)
      : await doc.embedJpg(base64);
  } catch {
    return null;
  }
}

function drawHeader(
  page: PDFPage,
  cursor: { y: number },
  view: GroupRoomlistView,
  fonts: Fonts,
  logo: PDFImage | null,
): void {
  if (logo) {
    const scale = Math.min(LOGO_HEIGHT / logo.height, LOGO_MAX_WIDTH / logo.width);
    const width = logo.width * scale;
    const height = logo.height * scale;
    // A logo fica à direita, na altura do nome da empresa: o olho lê primeiro o texto,
    // e a marca assina o documento sem empurrar a lista para a página seguinte.
    page.drawImage(logo, {
      x: A4.width - MARGIN - width,
      y: cursor.y - height + 12,
      width,
      height,
    });
  }

  const [company, title, ...rest] = headerLines(view);
  write(page, cursor, company ?? '', fonts.bold, 11, MUTED);
  write(page, cursor, title ?? '', fonts.bold, 20, INK);
  cursor.y -= 6;
  for (const line of rest) write(page, cursor, line, fonts.regular, 11, INK);
  cursor.y -= 6;
  rule(page, cursor);
}

function drawEntry(page: PDFPage, cursor: { y: number }, entry: RoomlistEntry, fonts: Fonts): void {
  const position = String(entry.position).padStart(2, '0');
  write(page, cursor, `${position}  ${entry.fullName}`, fonts.bold, 12, INK);
  write(page, cursor, `CPF ${entry.cpf} · Nascimento ${entry.birthDate}`, fonts.regular, 10, INK);
  write(page, cursor, `${entry.email} · ${entry.phone}`, fonts.regular, 10, INK);
  write(page, cursor, entry.address, fonts.regular, 10, INK);

  if (entry.companions.length > 0) {
    write(page, cursor, 'Acompanhantes:', fonts.regular, 10, MUTED);
    for (const companion of entry.companions) {
      write(
        page,
        cursor,
        `   ${companion.fullName} — ${companion.birthDate}`,
        fonts.regular,
        10,
        INK,
      );
    }
  }

  cursor.y -= 6;
  rule(page, cursor);
}

function drawFooter(
  page: PDFPage,
  font: PDFFont,
  pageNumber: number,
  total: number,
  view: GroupRoomlistView,
): void {
  const text = `Página ${String(pageNumber)} de ${String(total)} · gerado em ${stamp(view.generatedAt)}`;
  page.drawText(toWinAnsi(text), {
    x: MARGIN,
    y: MARGIN - 16,
    size: 9,
    font,
    color: MUTED,
  });
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
  cursor.y -= LINE;
}

function rule(page: PDFPage, cursor: { y: number }): void {
  page.drawLine({
    start: { x: MARGIN, y: cursor.y + 4 },
    end: { x: A4.width - MARGIN, y: cursor.y + 4 },
    thickness: 0.5,
    color: RULE,
  });
  cursor.y -= 10;
}

/** Quantas linhas um registro ocupa: 4 fixas + o cabeçalho e as linhas dos acompanhantes. */
function linesOf(entry: RoomlistEntry): number {
  return 5 + (entry.companions.length > 0 ? entry.companions.length + 1 : 0);
}

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/** Data e hora no fuso de Brasília — o documento é lido no Brasil. */
function stamp(date: Date): string {
  const local = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(local.getUTCDate())}/${pad(local.getUTCMonth() + 1)}/${String(local.getUTCFullYear())} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}

/** Caracteres acima de U+00FF que a WinAnsiEncoding conhece e a tela do sistema usa. */
const WIN_ANSI_EXTRA = new Set([
  '€',
  '‚',
  'ƒ',
  '„',
  '…',
  '†',
  '‡',
  'ˆ',
  '‰',
  'Š',
  '‹',
  'Œ',
  'Ž',
  '‘',
  '’',
  '“',
  '”',
  '•',
  '–',
  '—',
  '˜',
  '™',
  'š',
  '›',
  'œ',
  'ž',
  'Ÿ',
]);
