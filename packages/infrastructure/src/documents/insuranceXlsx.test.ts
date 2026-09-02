import { describe, expect, it } from 'vitest';
import { parseLocalDate } from '@expedition/domain';
import type { GroupInsuranceView } from '@expedition/application';
import type { InsuranceRow } from '@expedition/domain';
import {
  dateSerial,
  fillInsuranceSheet,
  insuranceFileName,
  readZip,
  renderInsuranceXlsx,
  writeZip,
} from './insuranceXlsx.js';

/**
 * GR-16 — a planilha do seguro. O modelo da seguradora é preenchido, não recriado: o
 * que se testa aqui é que as linhas entram nas colunas e nos tipos certos, e que o
 * resto do arquivo sobrevive intacto.
 */

function row(overrides: Partial<InsuranceRow> = {}): InsuranceRow {
  return {
    cpf: '11144477735',
    fullName: 'Ana Lima',
    birthDate: parseLocalDate('1990-05-20'),
    email: 'ana@example.com',
    phone: '(48)999998888',
    ...overrides,
  };
}

function view(rows: readonly InsuranceRow[]): GroupInsuranceView {
  return {
    group: { name: 'Coxilha Rica · 10/11/2026', startDate: parseLocalDate('2026-11-10') },
    rows,
    generatedAt: new Date('2026-08-31T12:00:00.000Z'),
  };
}

describe('GR-16: data como o Excel entende', () => {
  it('converte para o número de série, com a época de 1899-12-30', () => {
    // A coluna tem validação de data: texto seria recusado na conferência.
    expect(dateSerial(parseLocalDate('1899-12-31'))).toBe(1);
    expect(dateSerial(parseLocalDate('1900-01-01'))).toBe(2);
    expect(dateSerial(parseLocalDate('2000-01-01'))).toBe(36526);
  });
});

describe('GR-16: o zip do modelo sobrevive', () => {
  it('ler e reescrever preserva todas as entradas', async () => {
    const original = await readTemplate();
    const entries = readZip(original);

    const rebuilt = readZip(Buffer.from(writeZip(entries)));

    expect([...rebuilt.keys()]).toEqual([...entries.keys()]);
    for (const [name, content] of entries) {
      expect(rebuilt.get(name)?.equals(content)).toBe(true);
    }
  });

  it('o arquivo gerado continua sendo um zip de xlsx', async () => {
    const bytes = await renderInsuranceXlsx(view([row()]));

    expect(Buffer.from(bytes.subarray(0, 2)).toString('latin1')).toBe('PK');
    const entries = readZip(Buffer.from(bytes));
    // O que faz a seguradora aceitar: estilos, validação, imagem e planilha continuam lá.
    expect(entries.has('xl/styles.xml')).toBe(true);
    expect(entries.has('xl/media/image1.png')).toBe(true);
    expect(entries.has('xl/worksheets/sheet1.xml')).toBe(true);
  });
});

describe('GR-16: as linhas entram na coluna certa', () => {
  it('escreve a partir da linha 13, preservando o estilo de cada célula', () => {
    const xml =
      '<sheetData>' +
      '<row r="13"><c r="A13" s="24"/><c r="B13" s="25"/><c r="C13" s="26"/>' +
      '<c r="D13" s="27"/><c r="E13" s="28"/><c r="F13" s="28"/></row>' +
      '<row r="14"><c r="A14" s="24"/><c r="B14" s="30"/><c r="C14" s="31"/>' +
      '<c r="D14" s="32"/><c r="E14" s="33"/><c r="F14" s="33"/></row>' +
      '</sheetData>';

    const filled = fillInsuranceSheet(xml, [row(), row({ cpf: '52998224725', fullName: 'Beto' })]);

    // CPF é número (a coluna tem o formato que pontua e repõe o zero à esquerda).
    expect(filled).toContain('<c r="B13" s="25"><v>11144477735</v></c>');
    // Nome como string embutida: não mexe no sharedStrings do modelo.
    expect(filled).toContain('<c r="C13" s="26" t="inlineStr"><is><t>Ana Lima</t></is></c>');
    // Nascimento como serial, com o estilo de data que o modelo já traz.
    expect(filled).toContain(`<c r="D13" s="27"><v>${String(dateSerial(row().birthDate))}</v></c>`);
    expect(filled).toContain('<c r="E13" s="28" t="inlineStr"><is><t>ana@example.com</t></is></c>');
    expect(filled).toContain('<c r="F13" s="28" t="inlineStr"><is><t>(48)999998888</t></is></c>');
    // A segunda linha mantém os estilos dela, que são outros (o modelo é zebrado).
    expect(filled).toContain('<c r="B14" s="30"><v>52998224725</v></c>');
    expect(filled).toContain('<c r="C14" s="31" t="inlineStr"><is><t>Beto</t></is></c>');
  });

  it('escapa o que quebraria o XML', () => {
    const xml = '<sheetData><row r="13"><c r="C13" s="26"/></row></sheetData>';

    const filled = fillInsuranceSheet(xml, [row({ fullName: 'Ana & João <Filho>' })]);

    expect(filled).toContain('<t>Ana &amp; João &lt;Filho&gt;</t>');
  });

  it('campo vazio deixa a célula vazia, sem string em branco', () => {
    const xml = '<sheetData><row r="13"><c r="E13" s="28"/><c r="F13" s="28"/></row></sheetData>';

    const filled = fillInsuranceSheet(xml, [row({ email: '', phone: '' })]);

    expect(filled).toContain('<c r="E13" s="28"/>');
    expect(filled).toContain('<c r="F13" s="28"/>');
  });

  it('sem linhas, a planilha volta como estava', () => {
    const xml = '<sheetData><row r="13"><c r="B13" s="25"/></row></sheetData>';

    expect(fillInsuranceSheet(xml, [])).toBe(xml);
  });
});

describe('GR-16: o nome do arquivo', () => {
  it('diz seguro, a saída e a data, sem repetir a data do nome', () => {
    expect(insuranceFileName('Coxilha Rica · 10/11/2026', parseLocalDate('2026-11-10'))).toBe(
      'seguro-coxilha-rica-2026-11-10.xlsx',
    );
  });
});

async function readTemplate(): Promise<Buffer> {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const path = fileURLToPath(new URL('../../assets/seguro-template.xlsx', import.meta.url));
  return readFile(path);
}
