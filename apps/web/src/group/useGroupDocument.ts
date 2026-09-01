import { useCallback, useState } from 'react';
import { api } from '../auth/api.js';
import { documentErrorFor, fileNameFromDisposition } from './groupDocumentAction.js';

/**
 * GR-15/GR-16 — baixa um documento da saída (roomlist em PDF, lista do seguro em XLSX).
 *
 * O download passa por `fetch`, e não por uma âncora apontando para a URL, porque a rota
 * exige `Authorization` e âncora não carrega header — iria direto para o 401. Daí o
 * caminho: resposta → blob → âncora sintética → revoga a URL.
 */
export function useGroupDocument() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = useCallback(async (path: string, fallbackName: string): Promise<boolean> => {
    setBusy(path);
    setError(null);
    let objectUrl: string | null = null;
    try {
      const res = await api(path);
      if (!res.ok) {
        const parsed = (await res.json().catch(() => ({}))) as { error?: string };
        setError(documentErrorFor(parsed.error ?? ''));
        return false;
      }

      const blob = await res.blob();
      objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileNameFromDisposition(
        res.headers.get('content-disposition'),
        fallbackName,
      );
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      return true;
    } catch {
      setError('Falha de conexão.');
      return false;
    } finally {
      // Sempre, inclusive no caminho de erro: blob vivo é memória presa na aba.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setBusy(null);
    }
  }, []);

  return { busy, error, download };
}
