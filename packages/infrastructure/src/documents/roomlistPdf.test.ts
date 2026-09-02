import { describe, expect, it } from 'vitest';
import type { GroupRoomlistView } from '@expedition/application';
import type { RoomlistEntry } from '@expedition/domain';
import {
  companyLine,
  headerLines,
  renderRoomlistPdf,
  roomlistFileName,
  splitIntoPages,
  toWinAnsi,
  withoutDates,
} from './roomlistPdf.js';

/**
 * GR-15 — o papel. O que se testa aqui é o que quebra de verdade: paginação perdendo
 * registro, acento derrubando a rota e bytes que não são PDF. Layout fino é olho.
 */

function entry(position: number, companions = 0): RoomlistEntry {
  return {
    position,
    fullName: `Responsável ${String(position)}`,
    cpf: '900.000.100-57',
    birthDate: '14/01/1989',
    email: 'contato@example.com',
    phone: '+55 (48)99999-8877',
    address: 'Rua Luiz Pasteur, 509 — Trindade — Florianópolis/SC — CEP 88036-100',
    companions: Array.from({ length: companions }, (_, index) => ({
      fullName: `Acompanhante ${String(index + 1)}`,
      birthDate: '30/03/1983',
    })),
  };
}

function view(entries: readonly RoomlistEntry[]): GroupRoomlistView {
  return {
    company: { name: 'Drakkar Expedições', cnpj: '19131243000197', slug: 'drk', logo: null },
    group: {
      name: 'Coxilha Rica · 10/11/2026',
      itineraryName: 'Coxilha Rica',
      startDate: { year: 2026, month: 11, day: 10 },
      endDate: { year: 2026, month: 11, day: 14 },
    },
    entries,
    guestCount: entries.reduce((total, e) => total + 1 + e.companions.length, 0),
    generatedAt: new Date('2026-08-30T12:00:00.000Z'),
  };
}

describe('GR-15: paginação não perde nem duplica registro', () => {
  it('distribui os registros em páginas preservando a ordem', () => {
    const entries = Array.from({ length: 40 }, (_, index) => entry(index + 1, index % 3));

    const pages = splitIntoPages(entries, { linesPerPage: 40 });

    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flat().map((e) => e.position)).toEqual(entries.map((e) => e.position));
  });

  it('lista vazia é uma página vazia, não zero páginas', () => {
    // Sem isso, um grupo sem confirmadas geraria um PDF sem página nenhuma — arquivo
    // que nenhum leitor abre.
    expect(splitIntoPages([], { linesPerPage: 40 })).toEqual([[]]);
  });

  it('um registro maior que a página inteira não entra em laço infinito', () => {
    const pages = splitIntoPages([entry(1, 30)], { linesPerPage: 5 });

    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(1);
  });
});

describe('GR-15: o texto sobrevive ao português', () => {
  it('preserva acento, cedilha e til', () => {
    expect(toWinAnsi('Florianópolis · São Ângelo · Conceição')).toBe(
      'Florianópolis · São Ângelo · Conceição',
    );
  });

  it('troca o que a fonte não conhece em vez de explodir', () => {
    // Emoji e travessão longo colados num nome não podem derrubar a geração inteira.
    expect(toWinAnsi('Ana 🏕 Souza')).toBe('Ana ? Souza');
  });
});

describe('GR-15: a linha da empresa no cabeçalho', () => {
  it('CNPJ válido sai pontuado', () => {
    expect(
      companyLine({ name: 'Drakkar Expedições', cnpj: '19131243000197', slug: 'drk', logo: null }),
    ).toBe('Drakkar Expedições — CNPJ 19.131.243/0001-97');
  });

  it('sem CNPJ, só o nome', () => {
    expect(companyLine({ name: 'Drakkar Expedições', cnpj: null, slug: 'drk', logo: null })).toBe(
      'Drakkar Expedições',
    );
  });

  it('CNPJ inválido no cadastro sai como está, sem derrubar o documento', () => {
    // Campo mal preenchido meses atrás não pode impedir a saída de amanhã de ter roomlist.
    expect(companyLine({ name: 'Drakkar Expedições', cnpj: '123', slug: 'drk', logo: null })).toBe(
      'Drakkar Expedições — CNPJ 123',
    );
  });
});

describe('GR-15: o documento não fala de datas de estadia', () => {
  it('o nome da saída sai sem a data que costuma vir grudada nele', () => {
    // Decisão do dono do produto: a expedição nem sempre dorme no mesmo hotel a viagem
    // toda, então data no documento confunde. O período é combinado direto com o hotel.
    expect(withoutDates('Coxilha Rica · 10/11/2026')).toBe('Coxilha Rica');
    expect(withoutDates('Coxilha Rica • O caminho dos tropeiros · 10/10/2026')).toBe(
      'Coxilha Rica • O caminho dos tropeiros',
    );
    expect(withoutDates('Extremo Sul 05-07.09.26')).toBe('Extremo Sul');
    expect(withoutDates('Serra do Rio do Rastro 2026-10-10')).toBe('Serra do Rio do Rastro');
  });

  it('número que não é data continua no nome', () => {
    // "Grupo 24" identifica a saída: cortar o número deixaria dois grupos indistinguíveis.
    expect(withoutDates('Coxilha Rica Grupo 24')).toBe('Coxilha Rica Grupo 24');
    expect(withoutDates('Trilha 4x4 Grupo 3')).toBe('Trilha 4x4 Grupo 3');
  });

  it('o cabeçalho não tem período, nem data nenhuma da saída', () => {
    const lines = headerLines(view([entry(1, 1)]));

    expect(lines).toEqual([
      'Drakkar Expedições — CNPJ 19.131.243/0001-97',
      'ROOMLIST',
      'Saída: Coxilha Rica',
      '1 registro · 2 hóspedes',
    ]);
    expect(lines.join(' ')).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });
});

describe('CF-02: a logo da empresa no cabeçalho', () => {
  // 1×1 PNG transparente — basta para provar que a imagem entra no documento.
  const PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  it('com logo, o PDF fica maior — a imagem foi embutida', async () => {
    const semLogo = await renderRoomlistPdf(view([entry(1)]));
    const comLogo = await renderRoomlistPdf({
      ...view([entry(1)]),
      company: { name: 'Drakkar Expedições', cnpj: null, slug: 'drk', logo: PNG },
    });

    expect(comLogo.byteLength).toBeGreaterThan(semLogo.byteLength);
  });

  it('logo corrompida não derruba o documento — a roomlist sai sem ela', async () => {
    // O hotel espera a lista; uma imagem quebrada não pode custar a saída inteira.
    const bytes = await renderRoomlistPdf({
      ...view([entry(1)]),
      company: {
        name: 'Drakkar Expedições',
        cnpj: null,
        slug: 'drk',
        logo: 'data:image/png;base64,QUJD',
      },
    });

    expect(Buffer.from(bytes.slice(0, 5)).toString('latin1')).toBe('%PDF-');
  });

  it('sem logo, o cabeçalho é o mesmo de sempre', () => {
    expect(headerLines(view([entry(1)]))[0]).toBe('Drakkar Expedições — CNPJ 19.131.243/0001-97');
  });
});

describe('GR-15: o arquivo', () => {
  it('gera bytes de PDF válido', async () => {
    const bytes = await renderRoomlistPdf(view([entry(1, 2), entry(2)]));
    const head = Buffer.from(bytes.slice(0, 5)).toString('latin1');

    expect(head).toBe('%PDF-');
    expect(bytes.byteLength).toBeGreaterThan(500);
  });

  it('é determinístico: a mesma leitura gera os mesmos bytes', async () => {
    const document = view([entry(1, 1)]);

    const first = await renderRoomlistPdf(document);
    const second = await renderRoomlistPdf(document);

    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });

  it('o nome do arquivo diz a saída e a data, sem acento nem espaço', () => {
    expect(roomlistFileName('Coxilha Rica', { year: 2026, month: 11, day: 10 })).toBe(
      'roomlist-coxilha-rica-2026-11-10.pdf',
    );
  });

  it('o nome do grupo já costuma trazer a data — ela não se repete no arquivo', () => {
    expect(roomlistFileName('Coxilha Rica · 10/11/2026', { year: 2026, month: 11, day: 10 })).toBe(
      'roomlist-coxilha-rica-2026-11-10.pdf',
    );
  });

  it('o nome da saída cabe inteiro quando é do tamanho de sempre', () => {
    const name = roomlistFileName('Coxilha Rica • O caminho dos tropeiros · 10/10/2026', {
      year: 2026,
      month: 10,
      day: 10,
    });

    expect(name).toBe('roomlist-coxilha-rica-o-caminho-dos-tropeiros-2026-10-10.pdf');
  });

  it('nome muito longo é encurtado — anexo de e-mail não precisa de 80 caracteres', () => {
    const name = roomlistFileName(
      'Coxilha Rica e a Serra do Rio do Rastro pelos Campos de Cima da Serra',
      { year: 2026, month: 10, day: 10 },
    );

    expect(name).toBe('roomlist-coxilha-rica-e-a-serra-do-2026-10-10.pdf');
  });
});
