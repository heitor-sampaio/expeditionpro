/**
 * CF-01/CF-02 — a identidade da empresa, compartilhada entre a marca da navegação e a
 * aba Empresa.
 *
 * Um store mínimo em vez de contexto: os dois lugares que precisam do dado estão em
 * pontas opostas da árvore, e salvar na aba tem de atualizar a marca na hora. Buscar
 * duas vezes deixaria a navegação com o nome velho até o próximo F5.
 */

export interface Company {
  name: string;
  cnpj: string | null;
  slug: string;
  logo: string | null;
}

type Listener = () => void;

function createStore() {
  let current: Company | null = null;
  const listeners = new Set<Listener>();

  return {
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot(): Company | null {
      return current;
    },
    set(company: Company | null): void {
      current = company;
      for (const listener of listeners) listener();
    },
  };
}

export const companyStore = createStore();

/** Partículas que não identificam empresa nenhuma nas iniciais. */
const PARTICLES = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

/** CF-02: a marca sem logo — duas letras, como a navegação sempre mostrou. */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '' && !PARTICLES.has(word.toLowerCase()));
  if (words.length === 0) return 'EX';
  const first = words[0] ?? '';
  const second = words[1] ?? first.slice(1);
  return `${first.slice(0, 1)}${second.slice(0, 1)}`.toUpperCase();
}

export interface Size {
  width: number;
  height: number;
}

/** Cabe a imagem na caixa preservando a proporção. Nunca amplia: logo esticada borra. */
export function scaleToFit(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): Size {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
