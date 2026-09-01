import { useEffect, useState } from 'react';

type Mode = 'light' | 'dark';
type Density = 'compact' | 'comfy';

export interface ThemeControls {
  mode: Mode;
  density: Density;
  toggleMode: () => void;
  toggleDensity: () => void;
}

/**
 * Modo e densidade são atributos no elemento raiz — nenhum componente conhece
 * modo ou densidade, só os tokens mudam (design system §2). Persiste a escolha.
 */
export function useTheme(): ThemeControls {
  const [mode, setMode] = useState<Mode>(() => read('mode', 'light'));
  const [density, setDensity] = useState<Density>(() => read('density', 'compact'));

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-mode', mode);
    root.setAttribute('data-density', density);
    write('mode', mode);
    write('density', density);
  }, [mode, density]);

  return {
    mode,
    density,
    toggleMode: () => setMode((m) => (m === 'light' ? 'dark' : 'light')),
    toggleDensity: () => setDensity((d) => (d === 'compact' ? 'comfy' : 'compact')),
  };
}

function read<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(`exp.${key}`) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(`exp.${key}`, value);
  } catch {
    // armazenamento indisponível — segue sem persistir
  }
}
