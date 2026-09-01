import { useState } from 'react';

/**
 * Estado de "menu recolhido" da sidebar, persistido por origem (localStorage). Compartilhado
 * pelo back-office e pelo portal — a mesma preferência de densidade de navegação. Falha de
 * storage (aba privada) degrada para o estado da sessão, sem quebrar.
 */
const KEY = 'exp.sidebar.collapsed';

export function useSidebarCollapsed(): readonly [boolean, () => void] {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });

  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(KEY, next ? '1' : '0');
      } catch {
        // sem storage — vale só para a sessão
      }
      return next;
    });

  return [collapsed, toggle] as const;
}
