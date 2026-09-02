import { useCallback, useRef, useState } from 'react';
import { brl } from '../ui/money.js';
import { dropTarget, type ColumnBounds } from './dropTarget.js';
import { useBoard, type BoardColumn, type BoardOpportunity } from './useBoard.js';
import { useItineraries, type ItineraryDto } from '../agenda/useItineraries.js';

/**
 * §5.16 — o funil de oportunidades.
 *
 * Colunas em rolagem horizontal, cartões arrastáveis por **pointer events** (mouse, toque e
 * caneta na mesma API — o app do Capacitor depende disso). A decisão de qual coluna recebe
 * mora em `dropTarget`, que é função pura e testada; aqui só há DOM.
 *
 * Enquanto o fechamento (OP-08) não existir, a coluna de ganho não recebe cartão: soltar lá
 * mostra o porquê em vez de não reagir.
 */
export function CrmScreen(): React.JSX.Element {
  const { state, busy, refresh, criar, mover, definirRoteiro } = useBoard();
  // O quadro precisa da lista para o seletor; o nome do roteiro no cartão sai daqui, e
  // não de uma junção no servidor — a lista já viria de qualquer jeito.
  const roteiros = useItineraries(true);
  const listaRoteiros = roteiros.status === 'ready' ? roteiros.itineraries : [];
  const [aviso, setAviso] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);

  return (
    <main className="page page-wide">
      <div className="page-header">
        <div className="toolbar">
          <div>
            <h1 className="page-title">Funil</h1>
            <p className="page-meta">
              Quem está interessado, antes de virar inscrição. Arraste o cartão para mudar de etapa.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={state.status !== 'ready' || busy}
            onClick={() => {
              setAviso(null);
              setNovo(true);
            }}
          >
            Criar oportunidade
          </button>
        </div>
      </div>

      {aviso && (
        <div className="feedback feedback-info" role="status">
          <span className="feedback-dot" />
          <span>{aviso}</span>
        </div>
      )}

      {state.status === 'loading' && (
        <div className="skeleton">
          <div className="skel-card" />
          <div className="skel-card" />
          <div className="skel-card" />
        </div>
      )}

      {state.status === 'error' && (
        <div className="state" role="alert">
          <div className="state-text">
            <span className="state-title">Não deu para carregar o funil</span>
            <span className="state-line is-error">Tente de novo.</span>
          </div>
          <div className="state-grow" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>
            Tentar de novo
          </button>
        </div>
      )}

      {state.status === 'forbidden' && (
        <div className="state">
          <div className="state-text">
            <span className="state-title">Sem acesso ao funil</span>
            <span className="state-line">O funil é da equipe. Peça a um owner ou admin.</span>
          </div>
          <div className="state-grow" />
        </div>
      )}

      {state.status === 'ready' && state.columns.length === 0 && (
        <div className="state">
          <div className="state-text">
            <span className="state-title">O funil não tem etapas</span>
            <span className="state-line">
              Configure as etapas em Configurações para começar a usar o quadro.
            </span>
          </div>
          <div className="state-grow" />
        </div>
      )}

      {state.status === 'ready' && state.columns.length > 0 && (
        <Board
          columns={state.columns}
          busy={busy}
          roteiros={listaRoteiros}
          onMove={mover}
          onRoteiro={definirRoteiro}
          onAviso={setAviso}
        />
      )}

      {novo && (
        <NovaOportunidade
          busy={busy}
          roteiros={listaRoteiros}
          onClose={() => setNovo(false)}
          onCriar={async (dados) => {
            const r = await criar(dados);
            if (r.ok) {
              setNovo(false);
              setAviso(`${dados.contactName} entrou no funil.`);
            }
            return r;
          }}
        />
      )}
    </main>
  );
}

function Board({
  columns,
  busy,
  roteiros,
  onMove,
  onRoteiro,
  onAviso,
}: {
  columns: BoardColumn[];
  busy: boolean;
  roteiros: ItineraryDto[];
  onMove: (
    id: string,
    stageId: string,
    lostReason?: string,
  ) => Promise<{ ok: boolean; message?: string }>;
  onRoteiro: (id: string, itineraryId: string | null) => Promise<{ ok: boolean; message?: string }>;
  onAviso: (texto: string | null) => void;
}): React.JSX.Element {
  const colunasRef = useRef(new Map<string, HTMLElement>());
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [perda, setPerda] = useState<{ id: string; stageId: string; nome: string } | null>(null);

  const boundsAtuais = useCallback((): ColumnBounds[] => {
    return columns.flatMap((c) => {
      const el = colunasRef.current.get(c.stage.id);
      if (!el) return [];
      const r = el.getBoundingClientRect();
      return [{ stageId: c.stage.id, kind: c.stage.kind, left: r.left, right: r.right }];
    });
  }, [columns]);

  const soltar = useCallback(
    async (opportunity: BoardOpportunity, x: number) => {
      setArrastando(null);
      setAlvo(null);
      const destino = dropTarget(x, boundsAtuais());
      if (!destino || destino.stageId === opportunity.stageId) return;

      if (!destino.allowed) {
        onAviso(
          'Fechar negócio cria a inscrição, e isso ainda não está pronto — por enquanto a coluna de ganho não recebe cartão.',
        );
        return;
      }

      const coluna = columns.find((c) => c.stage.id === destino.stageId);
      if (coluna?.stage.kind === 'lost') {
        // OP-07: perder exige motivo, e pedir depois de soltar é o único momento em que a
        // pessoa já decidiu — perguntar antes atrapalharia o arrastar.
        setPerda({ id: opportunity.id, stageId: destino.stageId, nome: opportunity.contactName });
        return;
      }

      const r = await onMove(opportunity.id, destino.stageId);
      onAviso(r.ok ? null : (r.message ?? 'Não foi possível mover.'));
    },
    [boundsAtuais, columns, onMove, onAviso],
  );

  return (
    <>
      <div className="board">
        {columns.map((coluna) => (
          <section
            key={coluna.stage.id}
            className={`board-col${alvo === coluna.stage.id ? ' is-target' : ''}`}
            ref={(el) => {
              if (el) colunasRef.current.set(coluna.stage.id, el);
              else colunasRef.current.delete(coluna.stage.id);
            }}
          >
            <header className="board-col-head">
              <span className="board-col-name">{coluna.stage.name}</span>
              <span className="board-col-count">{coluna.opportunities.length}</span>
            </header>
            <p className="board-col-sum">
              {brl(coluna.expectedValueCents)} <span className="board-col-sum-label">previsto</span>
            </p>

            <div className="board-col-cards">
              {coluna.opportunities.length === 0 && (
                <p className="members-empty">Nenhuma oportunidade aqui.</p>
              )}
              {coluna.opportunities.map((o) => (
                <Card
                  key={o.id}
                  opportunity={o}
                  arrastando={arrastando === o.id}
                  desabilitado={busy}
                  onStart={() => setArrastando(o.id)}
                  onMovePointer={(x) => setAlvo(dropTarget(x, boundsAtuais())?.stageId ?? null)}
                  onDrop={(x) => void soltar(o, x)}
                  roteiros={roteiros}
                  onRoteiro={(itineraryId) => {
                    void onRoteiro(o.id, itineraryId).then((r) => {
                      if (!r.ok) onAviso(r.message ?? 'Não foi possível mudar o roteiro.');
                    });
                  }}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {perda && (
        <MotivoDaPerda
          nome={perda.nome}
          busy={busy}
          onClose={() => setPerda(null)}
          onConfirmar={async (motivo) => {
            const r = await onMove(perda.id, perda.stageId, motivo);
            if (r.ok) setPerda(null);
            else onAviso(r.message ?? 'Não foi possível mover.');
          }}
        />
      )}
    </>
  );
}

/** Limiar em pixels antes de considerar que virou arrasto, e não um toque. */
const LIMIAR = 6;

function Card({
  opportunity,
  arrastando,
  desabilitado,
  onStart,
  onMovePointer,
  onDrop,
  roteiros,
  onRoteiro,
}: {
  opportunity: BoardOpportunity;
  arrastando: boolean;
  desabilitado: boolean;
  onStart: () => void;
  onMovePointer: (x: number) => void;
  onDrop: (x: number) => void;
  roteiros: ItineraryDto[];
  onRoteiro: (itineraryId: string | null) => void;
}): React.JSX.Element {
  const inicio = useRef<{ x: number; y: number } | null>(null);
  const passouLimiar = useRef(false);

  return (
    <article
      className={`qcard board-card${arrastando ? ' is-dragging' : ''}`}
      // `touch-action: none` (no CSS) é o que impede a rolagem da página de roubar o gesto.
      onPointerDown={(e) => {
        if (desabilitado) return;
        inicio.current = { x: e.clientX, y: e.clientY };
        passouLimiar.current = false;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!inicio.current) return;
        const dx = Math.abs(e.clientX - inicio.current.x);
        const dy = Math.abs(e.clientY - inicio.current.y);
        if (!passouLimiar.current && Math.max(dx, dy) < LIMIAR) return;
        if (!passouLimiar.current) {
          passouLimiar.current = true;
          onStart();
        }
        onMovePointer(e.clientX);
      }}
      onPointerUp={(e) => {
        const arrastou = passouLimiar.current;
        inicio.current = null;
        passouLimiar.current = false;
        if (arrastou) onDrop(e.clientX);
      }}
      onPointerCancel={() => {
        inicio.current = null;
        passouLimiar.current = false;
      }}
    >
      <div className="qcard-head">
        <span className="avatar">{iniciais(opportunity.contactName)}</span>
        <span className="result-grow">
          <span className="member-name">{opportunity.contactName}</span>
          {opportunity.phone && <span className="member-cpf">{opportunity.phone}</span>}
        </span>
      </div>
      <div className="qcard-tags">
        <span className="pill pill-neutral">{ORIGEM[opportunity.source]}</span>
        {opportunity.expectedValueCents !== null && (
          <span className="board-card-value">
            {brl(opportunity.expectedValueCents)} <span className="board-col-sum-label">prev.</span>
          </span>
        )}
      </div>

      <select
        className="field-input board-card-select"
        aria-label={`Roteiro de ${opportunity.contactName}`}
        value={opportunity.itineraryId ?? ''}
        disabled={desabilitado}
        /*
         * O cartão inteiro captura o ponteiro para arrastar; sem parar aqui, tocar no
         * seletor começaria um arrasto em vez de abrir a lista.
         */
        onPointerDown={(e) => e.stopPropagation()}
        onChange={(e) => onRoteiro(e.target.value === '' ? null : e.target.value)}
      >
        <option value="">Sem roteiro definido</option>
        {roteiros.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>

      {opportunity.lostReason && <p className="qcard-alert">{opportunity.lostReason}</p>}
    </article>
  );
}

function NovaOportunidade({
  busy,
  roteiros,
  onClose,
  onCriar,
}: {
  busy: boolean;
  roteiros: ItineraryDto[];
  onClose: () => void;
  onCriar: (dados: {
    contactName: string;
    phone?: string;
    expectedValueCents?: number;
    itineraryId?: string;
  }) => Promise<{ ok: boolean; message?: string }>;
}): React.JSX.Element {
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [valor, setValor] = useState('');
  const [roteiro, setRoteiro] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const enviar = async () => {
    setErro(null);
    const r = await onCriar({
      contactName: nome.trim(),
      ...(telefone.trim() ? { phone: telefone.trim() } : {}),
      ...(valor.trim() ? { expectedValueCents: Math.round(Number(valor) * 100) } : {}),
      ...(roteiro ? { itineraryId: roteiro } : {}),
    });
    if (!r.ok) setErro(r.message ?? 'Não foi possível criar.');
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Criar oportunidade">
      <div className="modal">
        <h2 className="modal-title">Criar oportunidade</h2>
        <p className="modal-sub">
          Só o nome é obrigatório. O CPF vem depois, quando o negócio fechar.
        </p>

        {erro && (
          <div className="feedback feedback-error form-alert" role="alert">
            <span className="feedback-dot" />
            <span>{erro}</span>
          </div>
        )}

        <div className="form-grid">
          <label className="field field-wide">
            <span className="field-label">Nome do contato</span>
            <input
              className="field-input"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ana Prado"
            />
          </label>
          <label className="field">
            <span className="field-label">Telefone</span>
            <input
              className="field-input"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="48 99999-8877"
            />
          </label>
          <label className="field field-wide">
            <span className="field-label">Roteiro</span>
            <select
              className="field-input"
              value={roteiro}
              onChange={(e) => setRoteiro(e.target.value)}
            >
              <option value="">Ainda não sei</option>
              {roteiros.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <span className="field-help">
              Opcional. Muita conversa começa sem roteiro definido.
            </span>
          </label>
          <label className="field">
            <span className="field-label">Valor previsto</span>
            <input
              className="field-input"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="2000,00"
            />
            <span className="field-help">Previsão. Não entra em relatório financeiro.</span>
          </label>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>
            Voltar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || nome.trim() === ''}
            onClick={() => void enviar()}
          >
            {busy ? 'Criando…' : 'Criar oportunidade'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MotivoDaPerda({
  nome,
  busy,
  onClose,
  onConfirmar,
}: {
  nome: string;
  busy: boolean;
  onClose: () => void;
  onConfirmar: (motivo: string) => Promise<void>;
}): React.JSX.Element {
  const [motivo, setMotivo] = useState('');

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Motivo da perda">
      <div className="modal">
        <h2 className="modal-title">Por que perdeu?</h2>
        <p className="modal-sub">
          {nome} sai do funil como perdida. O motivo é o que faz essa informação valer alguma coisa
          depois.
        </p>

        <label className="field field-wide">
          <span className="field-label">Motivo</span>
          <input
            className="field-input"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="achou caro, escolheu outra data, sumiu…"
          />
        </label>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>
            Voltar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || motivo.trim() === ''}
            onClick={() => void onConfirmar(motivo.trim())}
          >
            Marcar como perdida
          </button>
        </div>
      </div>
    </div>
  );
}

const ORIGEM: Record<BoardOpportunity['source'], string> = {
  manual: 'Manual',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  messenger: 'Messenger',
  site: 'Site',
};

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? '?';
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : '';
  return (primeira + ultima).toUpperCase();
}
