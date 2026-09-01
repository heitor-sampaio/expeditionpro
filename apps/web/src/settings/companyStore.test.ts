import { describe, expect, it, vi } from 'vitest';
import { initials, scaleToFit } from './companyStore.js';

/**
 * CF-02 — o que a marca da navegação precisa decidir sem servidor: como caber a imagem
 * no espaço da logo e o que mostrar quando não há logo nenhuma.
 */

describe('CF-02: iniciais quando não há logo', () => {
  it('duas letras a partir do nome da empresa', () => {
    expect(initials('Drakkar Expedições')).toBe('DE');
    expect(initials('Drakkar')).toBe('DR');
  });

  it('ignora partículas — "de", "da", "dos" não identificam ninguém', () => {
    expect(initials('Estrada de Ferro Aventuras')).toBe('EF');
  });

  it('nome vazio não quebra a navegação', () => {
    expect(initials('   ')).toBe('EX');
  });
});

describe('CF-02: a logo cabe no espaço sem distorcer', () => {
  it('reduz pelo lado que estoura, preservando a proporção', () => {
    // Logo horizontal (600×200) num quadrado de 30: manda a largura.
    expect(scaleToFit(600, 200, 30, 30)).toEqual({ width: 30, height: 10 });
    // Logo vertical (200×600): manda a altura.
    expect(scaleToFit(200, 600, 30, 30)).toEqual({ width: 10, height: 30 });
  });

  it('imagem menor que o espaço não é ampliada — logo esticada fica borrada', () => {
    expect(scaleToFit(20, 10, 30, 30)).toEqual({ width: 20, height: 10 });
  });

  it('dimensão zero não gera divisão por zero', () => {
    expect(scaleToFit(0, 0, 30, 30)).toEqual({ width: 0, height: 0 });
  });
});

describe('CF-02: a navegação e a tela leem a mesma empresa', () => {
  it('quem assina recebe a mudança — salvar na aba atualiza a marca', async () => {
    const { companyStore } = await import('./companyStore.js');
    const listener = vi.fn();
    const unsubscribe = companyStore.subscribe(listener);

    companyStore.set({ name: 'Nova', cnpj: null, slug: 'drk', logo: null });

    expect(listener).toHaveBeenCalled();
    expect(companyStore.snapshot()?.name).toBe('Nova');
    unsubscribe();
  });

  it('depois de cancelar a assinatura, não notifica mais', async () => {
    const { companyStore } = await import('./companyStore.js');
    const listener = vi.fn();
    companyStore.subscribe(listener)();

    companyStore.set({ name: 'Outra', cnpj: null, slug: 'drk', logo: null });

    expect(listener).not.toHaveBeenCalled();
  });
});
