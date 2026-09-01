import { describe, expect, it } from 'vitest';
import { renderMarkdownToSafeHtml } from './markdownTerm.js';

/**
 * DOC-09 — Markdown → HTML por allowlist. Seguro por construção: escapa todo HTML antes
 * e só emite tags conhecidas. Nenhum `<script>` do texto do admin roda na sessão do cliente.
 */

describe('DOC-09: sanitização por construção', () => {
  it('escapa HTML cru do texto (não injeta tag)', () => {
    const html = renderMarkdownToSafeHtml('Oi <script>alert(1)</script> fim');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('link com esquema perigoso vira texto, não âncora', () => {
    const html = renderMarkdownToSafeHtml('[clique](javascript:alert(1))');
    expect(html).not.toContain('href="javascript');
    expect(html).not.toContain('<a ');
  });
});

describe('DOC-01: markdown do termo', () => {
  it('títulos, negrito, itálico', () => {
    const html = renderMarkdownToSafeHtml('## Cláusula 1\n\ntexto **forte** e *ênfase*');
    expect(html).toContain('<h2>Cláusula 1</h2>');
    expect(html).toContain('<strong>forte</strong>');
    expect(html).toContain('<em>ênfase</em>');
  });

  it('lista não ordenada', () => {
    const html = renderMarkdownToSafeHtml('- um\n- dois');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>um</li>');
    expect(html).toContain('<li>dois</li>');
  });

  it('parágrafos separados por linha em branco', () => {
    const html = renderMarkdownToSafeHtml('primeiro\n\nsegundo');
    expect(html).toContain('<p>primeiro</p>');
    expect(html).toContain('<p>segundo</p>');
  });

  it('link http válido vira âncora segura', () => {
    const html = renderMarkdownToSafeHtml('[site](https://drakkar.com)');
    expect(html).toContain('<a href="https://drakkar.com">site</a>');
  });

  it('preserva os marcadores {{variavel}} para a renderização posterior', () => {
    const html = renderMarkdownToSafeHtml('Olá {{cliente_nome}}');
    expect(html).toContain('{{cliente_nome}}');
  });

  it('o underscore dentro do marcador não vira itálico (marcador intacto)', () => {
    const html = renderMarkdownToSafeHtml('Eu, {{cliente_nome}}, CPF {{cliente_cpf}}.');
    expect(html).toContain('{{cliente_nome}}');
    expect(html).toContain('{{cliente_cpf}}');
    expect(html).not.toContain('<em>');
  });

  it('negrito ao redor de um marcador funciona e preserva o marcador', () => {
    const html = renderMarkdownToSafeHtml('Roteiro **{{roteiro}}** confirmado');
    expect(html).toContain('<strong>{{roteiro}}</strong>');
  });
});
