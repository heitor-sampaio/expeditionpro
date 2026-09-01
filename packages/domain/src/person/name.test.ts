import { describe, it, expect } from 'vitest';
import { normalizePersonName } from './name.js';

describe('CL-01: normalização de nome de pessoa', () => {
  it('deixa a primeira letra de cada palavra maiúscula', () => {
    expect(normalizePersonName('heitor sampaio')).toBe('Heitor Sampaio');
    expect(normalizePersonName('ANA ZORZI')).toBe('Ana Zorzi');
  });

  it('mantém partículas em minúsculas (menos quando abrem o nome)', () => {
    expect(normalizePersonName('maria da silva dos santos')).toBe('Maria da Silva dos Santos');
    expect(normalizePersonName('DA SILVA')).toBe('Da Silva'); // partícula na 1ª posição sobe
  });

  it('colapsa espaços e apara as bordas', () => {
    expect(normalizePersonName('  joão   pedro  ')).toBe('João Pedro');
  });

  it('capitaliza segmentos com hífen e apóstrofo', () => {
    expect(normalizePersonName('ana-maria de assis')).toBe('Ana-Maria de Assis');
    expect(normalizePersonName("d'ávila")).toBe("D'Ávila");
  });

  it('string vazia vira vazia', () => {
    expect(normalizePersonName('   ')).toBe('');
  });
});
