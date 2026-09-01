import { useState } from 'react';
import { AcceptedTermView } from '../documents/AcceptedTermView.js';
import { CouponControl } from './CouponControl.js';
import { RefundControl } from './RefundControl.js';
import { ChargeControl } from './ChargeControl.js';
import { PaymentControl } from './PaymentControl.js';
import { MovementsList } from './MovementsList.js';
import type { BoardRow } from './useGroupBoard.js';
import type { ActionResult, useGroupActions } from './useGroupActions.js';
import { brl } from '../ui/money.js';

type Actions = ReturnType<typeof useGroupActions>;
type Feedback = { kind: 'go' | 'info' | 'no'; text: string };

/**
 * Um item da fileira: ou abre uma gaveta, ou é uma ação que existe mas ainda não dá para
 * fazer. A indisponível mora na mesma lista para poder ficar na ordem certa — tirá-la de
 * lá foi o que a jogou para o fim antes.
 */
type Tab =
  | { kind: 'panel'; id: Panel; label: string; danger?: boolean }
  | { kind: 'unavailable'; label: string; why: string };

/** Cada botão da fileira e a gaveta que ele abre. `null` = nenhuma aberta. */
type Panel =
  | 'people'
  | 'payment'
  | 'charge'
  | 'movements'
  | 'refund'
  | 'discount'
  | 'restore'
  | 'term'
  | 'confirm'
  | 'checkin'
  | 'cancel';

/**
 * Linha expandida da mesa (design system §6): abre em --card-2 dentro da mesma tabela.
 *
 * As ações são uma **fileira de botões que troca o que aparece embaixo** — uma gaveta por
 * vez, o botão aceso marcando qual. Não é modal: modal cobre a mesa, e quase toda ação
 * daqui é lida contra os números da linha ("cobrar quanto?", "devolver de quê?"). Também
 * não são blocos empilhados, que era como estava antes: o painel crescia e o que se
 * procurava ficava no fim.
 *
 * O aceso usa `--o` porque seleção é estado de **interface**, não dado financeiro — a
 * mesma regra do item de navegação ativo.
 */
export function RowPanel({ row, actions }: { row: BoardRow; actions: Actions }): React.JSX.Element {
  const cancelled = row.status === 'cancelled';
  // Abre em Pessoas: expandir a linha é perguntar "quem é essa família?", e a gaveta
  // já responde. Continua sendo botão como os outros — dá para fechar e trocar.
  const [panel, setPanel] = useState<Panel | null>('people');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [paymentsKey, setPaymentsKey] = useState(0);
  const [chargesKey, setChargesKey] = useState(0);
  const bumpPayments = () => setPaymentsKey((k) => k + 1);
  const close = () => setPanel(null);

  // Clicar no botão aceso fecha: o mesmo gesto abre e devolve o espaço.
  const toggle = (id: Panel) => {
    setFeedback(null);
    setPanel((current) => (current === id ? null : id));
  };

  const handle = async (promise: Promise<ActionResult>, onOk: Feedback) => {
    setFeedback(null);
    const result = await promise;
    setFeedback(result.ok ? onOk : { kind: 'no', text: result.message });
    return result.ok;
  };

  const tabs: Tab[] = [
    { kind: 'panel', id: 'people', label: `Pessoas (${row.participants.length})` },
    { kind: 'panel', id: 'movements', label: 'Movimentações' },
    { kind: 'panel', id: 'payment', label: 'Lançar recebimento' },
    { kind: 'panel', id: 'charge', label: 'Emitir cobrança' },
    { kind: 'panel', id: 'refund', label: 'Registrar devolução' },
    { kind: 'panel', id: 'discount', label: 'Ajustar valor' },
    ...(row.priceAdjusted
      ? [{ kind: 'panel' as const, id: 'restore' as const, label: 'Restaurar preço de tabela' }]
      : []),
    { kind: 'panel', id: 'term', label: 'Ver termo aceito' },
    /*
     * A emissão sai pelo ASAAS e depende de informações fiscais na conta (certificado
     * digital e inscrição municipal), que ainda não existem. O botão fica desabilitado
     * dizendo por quê: melhor do que um botão que promete e falha, e melhor do que
     * esconder a ação que já está decidida.
     */
    {
      kind: 'unavailable',
      label: 'Emitir nota fiscal',
      why: 'Depende das informações fiscais na conta do ASAAS',
    },
    ...(row.status === 'pending'
      ? [{ kind: 'panel' as const, id: 'confirm' as const, label: 'Confirmar' }]
      : []),
    ...(row.checkedInAt
      ? [{ kind: 'panel' as const, id: 'checkin' as const, label: 'Desfazer check-in' }]
      : []),
    { kind: 'panel', id: 'cancel', label: 'Cancelar inscrição', danger: true },
  ];

  return (
    <div className="rowpanel">
      {feedback && (
        <div className={`feedback ${feedbackClass(feedback.kind)}`}>
          <span className="feedback-dot" />
          <span>{feedback.text}</span>
        </div>
      )}

      {cancelled ? (
        <>
          <p className="rowpanel-note">
            Inscrição cancelada. Os recebimentos ficam no ledger — o tratamento é decidido à parte.
          </p>
          {/*
           * Cancelada perde as ações, mas não o histórico nem o termo: um é o que entrou e
           * saiu de dinheiro, o outro prova o que foi combinado — e é justamente depois do
           * cancelamento que alguém precisa dos dois.
           */}
          <div className="rowpanel-actions">
            <TabButton
              label={`Pessoas (${row.participants.length})`}
              active={panel === 'people'}
              onClick={() => toggle('people')}
            />
            <TabButton
              label="Movimentações"
              active={panel === 'movements'}
              onClick={() => toggle('movements')}
            />
            <TabButton
              label="Ver termo aceito"
              active={panel === 'term'}
              onClick={() => toggle('term')}
            />
          </div>
        </>
      ) : (
        <div className="rowpanel-actions">
          {tabs.map((tab) =>
            tab.kind === 'panel' ? (
              <TabButton
                key={tab.id}
                label={tab.label}
                active={panel === tab.id}
                danger={tab.danger === true}
                onClick={() => toggle(tab.id)}
              />
            ) : (
              <button
                key={tab.label}
                type="button"
                className="btn btn-secondary btn-sm"
                disabled
                title={tab.why}
              >
                {tab.label}
              </button>
            ),
          )}
        </div>
      )}

      {panel === 'people' && (
        <div className="rowpanel-drawer">
          <h3 className="drawer-title">Pessoas ({row.participants.length})</h3>
          <PeopleList row={row} />
        </div>
      )}

      {panel === 'payment' && (
        <PaymentControl
          busy={actions.busy}
          onClose={close}
          onSubmit={async (input) => {
            const ok = await handle(actions.registerPayment(row.bookingId, input), {
              kind: 'go',
              text: 'Recebimento lançado.',
            });
            if (ok) {
              bumpPayments();
              setPanel('movements');
            }
          }}
        />
      )}

      {panel === 'charge' && (
        <ChargeControl
          row={row}
          actions={actions}
          onFeedback={setFeedback}
          onClose={close}
          onEmitted={() => {
            setChargesKey((k) => k + 1);
            setPanel('movements');
          }}
        />
      )}

      {panel === 'movements' && (
        <div className="rowpanel-drawer">
          <h3 className="drawer-title">Movimentações</h3>
          <MovementsList
            row={row}
            actions={actions}
            chargesKey={chargesKey}
            paymentsKey={paymentsKey}
            onFeedback={setFeedback}
            onDeleted={bumpPayments}
          />
        </div>
      )}

      {panel === 'refund' && (
        <RefundControl
          row={row}
          actions={actions}
          onDone={bumpPayments}
          onFeedback={setFeedback}
          onClose={close}
        />
      )}

      {panel === 'discount' && (
        <DiscountControl row={row} actions={actions} onFeedback={setFeedback} onClose={close} />
      )}

      {panel === 'restore' && (
        <RestorePriceControl row={row} actions={actions} onFeedback={setFeedback} onClose={close} />
      )}

      {panel === 'term' && (
        <div className="rowpanel-drawer">
          <h3 className="drawer-title">Termo de adesão</h3>
          <AcceptedTermView bookingId={row.bookingId} autoLoad onClose={close} />
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={close}>
              Fechar
            </button>
          </div>
        </div>
      )}

      {panel === 'confirm' && (
        <ConfirmControl row={row} actions={actions} onFeedback={setFeedback} onClose={close} />
      )}

      {panel === 'checkin' && (
        <CheckInUndo row={row} actions={actions} onFeedback={setFeedback} onClose={close} />
      )}

      {panel === 'cancel' && (
        <CancelControl row={row} actions={actions} onFeedback={setFeedback} onClose={close} />
      )}

      <CouponControl row={row} />
    </div>
  );
}

/**
 * GR-07 — quem viaja nesta inscrição.
 *
 * Só a lista: o contêiner e o título são da gaveta que a abre. É a lição que Movimentações
 * deixou — componente que traz a própria moldura vira caixa dentro de caixa e título
 * repetido no dia em que alguém o coloca dentro de outra coisa.
 *
 * Mostra a categoria de preço porque é ela que explica o valor de cada um — criança maior
 * custa diferente de adulto, e sem isso o unitário parece arbitrário. O responsável vem
 * marcado: é dele o CPF da inscrição e é com ele que a casa fala.
 */
function PeopleList({ row }: { row: BoardRow }): React.JSX.Element {
  return (
    <ul className="people-list">
      {row.participants.map((participant) => (
        <li key={participant.customerId} className="people-row">
          <span className="people-name">{participant.fullName}</span>
          {participant.customerId === row.responsibleCustomerId && (
            <span className="people-tag">responsável</span>
          )}
          <span className="people-grow" />
          <span className="people-category">{categoryLabel(participant.priceCategory)}</span>
          <span className="people-amount">{brl(participant.unitPriceCents)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Como cada categoria de preço (§3.4) é dita para quem lê a mesa. */
function categoryLabel(category: string): string {
  const map: Record<string, string> = {
    COUPLE: 'casal',
    SOLO: 'solo',
    EXTRA_ADULT: 'adulto extra',
    CHILD_MID: 'criança maior',
    CHILD_YOUNG: 'criança menor',
    MANUAL: 'pacote',
  };
  return map[category] ?? category.toLowerCase();
}

/**
 * O botão da fileira. Todos iguais: numa barra de abas, um botão primário competiria com
 * o aceso — dois laranjas diferentes na mesma linha, um dizendo "principal" e o outro
 * "selecionado". Aceso é `--o` porque seleção é estado de interface.
 *
 * O destrutivo mantém a borda vermelha mesmo aceso: ali a cor diz o que a ação faz, não
 * se está escolhida.
 */
function TabButton({
  label,
  active,
  danger = false,
  onClick,
}: {
  label: string;
  active: boolean;
  danger?: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`btn btn-secondary btn-sm${danger ? ' btn-danger' : ''}${active ? ' is-active' : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/**
 * GR-04 — a volta do ajuste: devolve a inscrição ao preço que a tabela do roteiro diz
 * para esta saída.
 *
 * Só aparece quando há o que desfazer, e pergunta antes: numa fileira de botões, o clique
 * errado é fácil, e este mexe em dinheiro sem formulário nenhum para dar tempo de pensar.
 */
function RestorePriceControl({
  row,
  actions,
  onFeedback,
  onClose,
}: {
  row: BoardRow;
  actions: Actions;
  onFeedback: (f: Feedback) => void;
  onClose: () => void;
}): React.JSX.Element | null {
  if (!row.priceAdjusted) return null;

  const restore = async () => {
    const result = await actions.restorePrice(row.bookingId);
    onClose();
    onFeedback(
      result.ok
        ? { kind: 'info', text: 'Preço de tabela restaurado.' }
        : { kind: 'no', text: result.message },
    );
  };

  return (
    <div className="rowpanel-drawer">
      <h3 className="drawer-title">Restaurar preço de tabela</h3>
      <p className="drawer-sub">
        Desfaz o ajuste e devolve a inscrição ao preço do roteiro para esta saída. O motivo
        registrado no ajuste some junto.
      </p>
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={actions.busy}
          onClick={() => void restore()}
        >
          Restaurar
        </button>
      </div>
    </div>
  );
}

/**
 * GR-04 — o desconto de balcão. A equipe negocia sobre o **total** ("dou 10% para essa
 * família"), então é assim que o formulário pergunta: um número e um alternador % / R$.
 *
 * A prévia mostra de quanto para quanto **antes** de aplicar — desconto é dinheiro que
 * não entra, e o número tem que ser conferido enquanto ainda dá para desistir. O rateio
 * entre os participantes é do servidor; aqui só se mostra o total, que é a linguagem em
 * que a negociação acontece.
 */
function DiscountControl({
  row,
  actions,
  onFeedback,
  onClose,
}: {
  row: BoardRow;
  actions: Actions;
  onFeedback: (f: Feedback) => void;
  onClose: () => void;
}): React.JSX.Element {
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'percent' | 'fixed'>('percent');
  const [amount, setAmount] = useState('');

  const typed = Number(amount.replace(',', '.'));
  const hasAmount = amount.trim() !== '' && Number.isFinite(typed) && typed > 0;
  // Espelha o domínio: percentual arredonda para baixo, para o desconto nunca sair maior
  // que o combinado. A conta que vale é a do servidor — esta é só a prévia.
  const discountCents = !hasAmount
    ? 0
    : mode === 'percent'
      ? Math.floor((row.contractedCents * typed) / 100)
      : Math.round(typed * 100);
  const novoTotal = row.contractedCents - discountCents;
  const valid =
    reason.trim() !== '' &&
    hasAmount &&
    discountCents > 0 &&
    novoTotal >= 0 &&
    (mode !== 'percent' || typed <= 100);

  const submit = async () => {
    const result = await actions.discountBooking(
      row.bookingId,
      reason.trim(),
      mode,
      mode === 'percent' ? typed : discountCents,
    );
    if (result.ok) {
      onFeedback({ kind: 'go', text: 'Desconto aplicado.' });
      onClose();
      setReason('');
      setAmount('');
    } else {
      onFeedback({ kind: 'no', text: result.message });
    }
  };

  return (
    <div className="rowpanel-drawer">
      <h3 className="drawer-title">Ajustar valor</h3>
      <p className="drawer-sub">
        O desconto vale para o total da inscrição; o sistema rateia entre os participantes.
      </p>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Desconto</span>
          <input
            className="field-input is-mono"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={mode === 'percent' ? '10' : '358,00'}
            aria-label="Valor do desconto"
          />
        </label>
        <label className="field">
          <span className="field-label">Em</span>
          <select
            className="field-input"
            value={mode}
            onChange={(e) => setMode(e.target.value as 'percent' | 'fixed')}
            aria-label="Desconto em percentual ou em reais"
          >
            <option value="percent">%</option>
            <option value="fixed">R$</option>
          </select>
        </label>
      </div>
      <input
        className="field-input"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motivo (obrigatório) — cortesia, permuta, negociado…"
      />
      {valid && (
        <p className="field-help">
          De {brl(row.contractedCents)} por <strong className="is-mono">{brl(novoTotal)}</strong> —
          abate {brl(discountCents)}.
        </p>
      )}
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={actions.busy || !valid}
          onClick={() => void submit()}
        >
          Aplicar ajuste
        </button>
      </div>
    </div>
  );
}

function ConfirmControl({
  row,
  actions,
  onFeedback,
  onClose,
}: {
  row: BoardRow;
  actions: Actions;
  onFeedback: (f: Feedback) => void;
  onClose: () => void;
}): React.JSX.Element | null {
  const [note, setNote] = useState('');

  if (row.status !== 'pending') return null;

  // IN-08: o primeiro recebimento confirma sozinho. Uma inscrição pendente com dinheiro
  // dentro é anomalia (pagamento excluído depois de confirmar), e o aviso muda de tom.
  const semPagamento = row.receivedCents <= 0;

  const submit = async () => {
    const result = await actions.confirmManually(row.bookingId, note.trim());
    if (result.ok) {
      onClose();
      setNote('');
    }
    onFeedback(
      result.ok
        ? { kind: 'go', text: 'Inscrição confirmada.' }
        : { kind: 'no', text: result.message },
    );
  };

  return (
    <div className="rowpanel-drawer">
      <h3 className="drawer-title">Confirmar inscrição</h3>
      {/*
       * Aviso operacional é cinza (design system §6): confirmar sem pagamento não é erro
       * nem sucesso financeiro, é exceção — e exceção se registra, não se pinta de
       * vermelho.
       */}
      {semPagamento ? (
        <div className="feedback feedback-info">
          <span className="feedback-dot" />
          <span>
            Esta inscrição não tem nenhum recebimento. Confirmar sem pagamento é exceção e vai
            ocupar vaga no grupo.
          </span>
        </div>
      ) : (
        <p className="drawer-sub">Já entraram R$ {brl(row.receivedCents)} nesta inscrição.</p>
      )}
      <label className="field">
        <span className="field-label">Motivo</span>
        <input
          className="field-input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Cortesia, permuta, pago por fora…"
        />
        <span className="field-help">Fica gravado na inscrição, junto de quem confirmou.</span>
      </label>
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={actions.busy || note.trim() === ''}
          onClick={() => void submit()}
        >
          Confirmar
        </button>
      </div>
    </div>
  );
}

/**
 * IN-15/IN-16 — cancelar a inscrição. Botão que abre modal, como as outras ações do
 * painel: o motivo é obrigatório e o cancelamento **não apaga recebimento** — o valor
 * fica no ledger e o tratamento (devolução, crédito, retenção) é decidido à parte.
 *
 * Cor não muda: o design system reserva vermelho para o dado, e é o **verbo** que
 * carrega a intenção destrutiva.
 */
function CancelControl({
  row,
  actions,
  onFeedback,
  onClose,
}: {
  row: BoardRow;
  actions: Actions;
  onFeedback: (f: { kind: 'go' | 'info' | 'no'; text: string }) => void;
  onClose: () => void;
}): React.JSX.Element {
  const [reason, setReason] = useState('');

  const submit = async () => {
    const result = await actions.cancelBooking(row.bookingId, reason.trim());
    if (result.ok) {
      onClose();
      setReason('');
    }
    onFeedback(
      result.ok
        ? { kind: 'no', text: 'Inscrição cancelada.' }
        : { kind: 'no', text: result.message },
    );
  };

  return (
    <div className="rowpanel-drawer">
      <h3 className="drawer-title">Cancelar inscrição</h3>
      <p className="drawer-sub">
        A família sai do grupo e a vaga é liberada. Os recebimentos ficam no ledger — a devolução é
        decidida à parte.
      </p>

      <label className="field">
        <span className="field-label">Motivo</span>
        <input
          className="field-input"
          value={reason}
          autoFocus
          onChange={(e) => setReason(e.target.value)}
          placeholder="Por que está sendo cancelada"
        />
        <span className="field-help">Fica no histórico da inscrição.</span>
      </label>

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={actions.busy || reason.trim() === ''}
          onClick={() => void submit()}
        >
          Cancelar inscrição
        </button>
      </div>
    </div>
  );
}
/**
 * GR-14 — desfazer o check-in. Fica aqui, e não na linha, porque é correção de engano:
 * o caminho normal é marcar. Só a equipe chega neste painel.
 */
function CheckInUndo({
  row,
  actions,
  onFeedback,
  onClose,
}: {
  row: BoardRow;
  actions: Actions;
  onFeedback: (feedback: Feedback) => void;
  onClose: () => void;
}): React.JSX.Element | null {
  if (!row.checkedInAt) return null;

  const undo = async () => {
    const result = await actions.undoCheckIn(row.bookingId);
    onClose();
    onFeedback(
      result.ok
        ? { kind: 'info', text: 'Check-in desfeito.' }
        : { kind: 'no', text: result.message },
    );
  };

  return (
    <div className="rowpanel-drawer">
      <h3 className="drawer-title">Desfazer check-in</h3>
      <p className="drawer-sub">
        A família embarcou em {formatCheckIn(row.checkedInAt)}. Desfazer devolve a inscrição para
        "não embarcou" — dá para marcar de novo depois.
      </p>
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={actions.busy}
          onClick={() => void undo()}
        >
          Desfazer
        </button>
      </div>
    </div>
  );
}

function formatCheckIn(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function feedbackClass(kind: 'go' | 'info' | 'no'): string {
  if (kind === 'go') return 'feedback-go';
  if (kind === 'no') return 'feedback-error';
  return 'feedback-info';
}

/** Centavos → texto do campo, no formato que o operador digita. */
