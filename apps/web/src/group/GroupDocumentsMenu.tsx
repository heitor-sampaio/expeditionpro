import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth.js';
import { useGroupDocument } from './useGroupDocument.js';
import { resolveGroupDocumentAction } from './groupDocumentAction.js';
import { NavIcon } from '../ui/NavIcon.js';

/**
 * GR-15/GR-16/GR-17 — os documentos da saída num menu só, ao lado do menu "Saída":
 * roomlist para o hotel, lista do seguro para o corretor e a do comboio para a estrada.
 *
 * Menu, e não três botões: o cabeçalho tem espaço para dois disparadores, não para
 * cinco, e os três documentos respondem à mesma pergunta ("o que eu levo desta saída?").
 * Item indisponível fica **visível e desabilitado com o motivo à vista** — esconder a
 * ação esconderia o sistema de quem ainda não tem permissão.
 */

type DocumentId = 'roomlist' | 'seguro' | 'comboio';

const ITEMS: readonly { id: DocumentId; label: string; hint: string }[] = [
  { id: 'roomlist', label: 'Gerar roomlist', hint: 'PDF para o hotel' },
  { id: 'seguro', label: 'Gerar lista do seguro', hint: 'planilha da seguradora' },
  { id: 'comboio', label: 'Gerar lista do comboio', hint: 'PDF ou planilha' },
];

export function GroupDocumentsMenu({
  groupId,
  confirmedCount,
}: {
  groupId: string;
  confirmedCount: number;
}): React.JSX.Element {
  const auth = useAuth();
  const { busy, error, download } = useGroupDocument();
  const [menuOpen, setMenuOpen] = useState(false);
  const [convoyOpen, setConvoyOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const role = auth.status === 'signed-in' ? auth.role : null;
  const action = resolveGroupDocumentAction({ confirmedCount, role });

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const pick = (id: DocumentId) => {
    setMenuOpen(false);
    if (id === 'comboio') {
      setConvoyOpen(true);
      return;
    }
    const path =
      id === 'roomlist'
        ? `/v1/groups/${groupId}/roomlist.pdf`
        : `/v1/groups/${groupId}/seguro.xlsx`;
    void download(path, id === 'roomlist' ? 'roomlist.pdf' : 'seguro.xlsx');
  };

  return (
    <div className="link-actions" ref={ref}>
      <button
        type="button"
        className="btn btn-secondary btn-sm btn-icon"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        disabled={busy !== null}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <NavIcon id="documentos" />
        <span>{busy === null ? 'Documentos' : 'Gerando…'}</span>
      </button>

      {menuOpen && (
        <div className="menu" role="menu">
          {ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className="menu-item"
              disabled={!action.enabled}
              title={action.reason ?? undefined}
              onClick={() => pick(item.id)}
            >
              {item.label}
              <span className="menu-item-reason">{action.reason ?? item.hint}</span>
            </button>
          ))}
        </div>
      )}

      {error !== null && <span className="roomlist-note is-error">{error}</span>}

      {convoyOpen && (
        <ConvoyFormatModal
          busy={busy !== null}
          onClose={() => setConvoyOpen(false)}
          onConfirm={async (format) => {
            const ok = await download(
              `/v1/groups/${groupId}/comboio.${format}`,
              `comboio.${format}`,
            );
            if (ok) setConvoyOpen(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * GR-17 — o formato é escolha de quem vai usar o documento: PDF para imprimir e levar,
 * planilha para reordenar os carros. É o único dos três que sai em dois formatos.
 */
function ConvoyFormatModal({
  busy,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  onClose: () => void;
  onConfirm: (format: 'pdf' | 'xlsx') => Promise<void>;
}): React.JSX.Element {
  const [format, setFormat] = useState<'pdf' | 'xlsx'>('pdf');

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Gerar lista do comboio">
      <div className="modal">
        <h2 className="modal-title">Gerar lista do comboio</h2>
        <p className="modal-sub">Condutor, marca, modelo e placa de cada carro da saída.</p>

        <label className="check-row">
          <input
            type="radio"
            name="convoy-format"
            checked={format === 'pdf'}
            onChange={() => setFormat('pdf')}
          />
          <span>PDF — para imprimir e levar na saída</span>
        </label>
        <label className="check-row">
          <input
            type="radio"
            name="convoy-format"
            checked={format === 'xlsx'}
            onChange={() => setFormat('xlsx')}
          />
          <span>Planilha — para reordenar os carros e anotar</span>
        </label>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Voltar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void onConfirm(format)}
          >
            {busy ? 'Gerando…' : 'Gerar'}
          </button>
        </div>
      </div>
    </div>
  );
}
