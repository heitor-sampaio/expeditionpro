import { saidasDoLink } from './saidasDoLink.js';
import { useState } from 'react';
import { formatDateRangeLong } from '../ui/format.js';
import { whatsappLink } from '../ui/whatsapp.js';
import { WhatsAppIcon } from '../ui/WhatsAppIcon.js';
import { TENANT_WHATSAPP } from '../tenant.js';
import { usePublicEnrollmentLink, type PublicSaida } from './usePublicEnrollmentLink.js';
import { EnrollmentFormFields } from './EnrollmentFormFields.js';
import { formularioVazio, podeEnviar, type EnrollmentForm } from './enrollmentForm.js';
import { useEnviarInscricao } from './useEnviarInscricao.js';
import type { PublicRouteInscricao } from './publicRoute.js';

/**
 * IN-25 — a página que o botão do site de apresentação abre.
 *
 * É a única tela do sistema que um estranho vê. Ela responde três coisas, nesta ordem: qual
 * roteiro é, qual saída o link escolheu, e o que fazer agora.
 *
 * **O link velho não fecha a porta.** Um anúncio continua rodando depois de a saída fechar, e
 * quem clica em março num link de janeiro é um interessado como qualquer outro — as outras
 * datas ficam à vista, e trocar é um toque.
 */
export function PublicEnrollmentScreen({
  rota,
}: {
  rota: PublicRouteInscricao;
}): React.JSX.Element {
  const state = usePublicEnrollmentLink(rota);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [form, setForm] = useState<EnrollmentForm>(formularioVazio);
  const envio = useEnviarInscricao();

  if (state.status === 'loading') {
    return (
      <Casca>
        <div className="skeleton" aria-busy="true" aria-label="Carregando">
          <div className="skel-card">
            <span className="skel-bars">
              <span className="skel-bar" />
              <span className="skel-bar short" />
            </span>
          </div>
        </div>
      </Casca>
    );
  }

  if (state.status === 'not-found') {
    return (
      <Casca>
        <EstadoSemSaida
          titulo="Este link não leva a uma expedição"
          linha="Ele pode ter sido encerrado. Fale com a equipe que a gente acha a saída certa para você."
        />
      </Casca>
    );
  }

  if (state.status === 'error') {
    return (
      <Casca>
        <EstadoSemSaida
          titulo="Não deu para carregar"
          linha="Verifique a conexão e tente de novo. Se continuar, fale com a equipe."
        />
      </Casca>
    );
  }

  const { view } = state;
  const { opcoes, escolhaAberta } = saidasDoLink(view);
  const selecionada = view.match ?? view.alternatives.find((s) => s.groupId === escolhida) ?? null;
  const atual = escolhida ?? view.match?.groupId ?? null;
  const semNenhuma = view.match === null && view.alternatives.length === 0;

  /*
   * Enviada, o formulário sai da tela. Deixá-lo ali convidaria a mandar de novo — e diria, sem
   * querer, que talvez não tenha dado certo.
   */
  if (envio.state.status === 'done') {
    return (
      <Casca>
        <h1 className="page-title">Inscrição recebida</h1>
        <section className="card pub-card">
          <span className="cell-name">
            {selecionada === null
              ? view.itineraryName
              : `${view.itineraryName} · ${formatDateRangeLong(selecionada.startDate, selecionada.endDate)}`}
          </span>
          <span className="field-help">
            A equipe confere os dados e entra em contato pelo WhatsApp para combinar o pagamento.
            Sua vaga fica garantida quando o primeiro pagamento entrar.
          </span>
        </section>
        <a
          className="btn btn-wa btn-ico pub-cta"
          href={whatsappLink(
            TENANT_WHATSAPP,
            `Olá! Acabei de me inscrever na ${view.itineraryName}.`,
          )}
          target="_blank"
          rel="noreferrer"
        >
          <WhatsAppIcon />
          Falar com a equipe agora
        </a>
      </Casca>
    );
  }

  return (
    <Casca>
      <h1 className="page-title">{view.itineraryName}</h1>

      {semNenhuma ? (
        <EstadoSemSaida
          titulo="Sem data aberta no momento"
          linha="As próximas saídas deste roteiro ainda não foram abertas. Fale com a equipe para saber quando entram."
        />
      ) : (
        <>
          {/*
           * Cinza, e nunca vermelho: o mês do link ter fechado não é erro de ninguém — é o
           * desenho funcionando. Vermelho, neste sistema, quer dizer cancelado.
           */}
          {view.match === null && (
            <div className="feedback feedback-info">
              <span className="feedback-dot" />
              <span>
                {view.saidaReconhecida
                  ? 'A data deste link não está mais aberta. Escolha uma das próximas:'
                  : 'Não reconheci a data deste link. Escolha uma das próximas:'}
              </span>
            </div>
          )}

          <section className="card pub-card">
            <span className="field-label">{escolhaAberta ? 'Escolha a saída' : 'Sua saída'}</span>

            <div className="enroll-list">
              {opcoes.map((saida) =>
                escolhaAberta ? (
                  <label
                    key={saida.groupId}
                    className={`check-row pub-saida${atual === saida.groupId ? ' is-selected' : ''}`}
                  >
                    <input
                      type="radio"
                      className="check"
                      name="saida"
                      checked={atual === saida.groupId}
                      onChange={() => setEscolhida(saida.groupId)}
                    />
                    <span className="check-name">
                      {formatDateRangeLong(saida.startDate, saida.endDate)}
                    </span>
                    <span className="cell-sub">{vagasDe(saida)}</span>
                  </label>
                ) : (
                  <div key={saida.groupId} className="check-row pub-saida is-selected">
                    <span className="check-name">
                      {formatDateRangeLong(saida.startDate, saida.endDate)}
                    </span>
                    <span className="cell-sub">{vagasDe(saida)}</span>
                  </div>
                ),
              )}
            </div>
          </section>

          <EnrollmentFormFields form={form} onChange={setForm} />

          {/*
           * DOC-04 · SEC-11 — o aceite é capturado **na inscrição**, e cobre explicitamente o
           * dado das crianças que o responsável está informando por elas. Sem ele não há base
           * para guardar nada do que foi preenchido.
           */}
          <label className="check-row pub-aceite">
            <input
              type="checkbox"
              className="check"
              checked={form.aceite}
              onChange={(e) => setForm({ ...form, aceite: e.target.checked })}
            />
            <span className="check-name">
              Li e aceito o termo de adesão, e autorizo o tratamento dos dados informados aqui,
              inclusive os das pessoas que vão comigo.
            </span>
          </label>

          {envio.state.status === 'error' && (
            <div className="feedback feedback-error" role="alert">
              <span className="feedback-dot" />
              <span>{envio.state.message}</span>
            </div>
          )}

          <button
            type="button"
            className="btn btn-primary pub-cta"
            disabled={!podeEnviar(form, atual) || envio.state.status === 'sending'}
            onClick={() => {
              if (atual === null) return;
              void envio.enviar(form, {
                // O slug que o servidor reconheceu, não o que veio na barra de endereço:
                // aqui eles são o mesmo valor, e o da resposta é o que ele já normalizou.
                roteiro: view.itinerarySlug,
                saida: rota.saida,
                groupId: atual,
              });
            }}
          >
            {envio.state.status === 'sending' ? 'Enviando…' : 'Enviar inscrição'}
          </button>

          {/*
           * O que acontece depois, dito antes de acontecer: a inscrição não confirma vaga até a
           * equipe olhar, e prometer o contrário faria alguém contar com uma viagem que ainda
           * não está garantida.
           */}
          <p className="field-help pub-nota">
            A equipe confere os dados e entra em contato para o pagamento. Sua vaga fica garantida
            quando o primeiro pagamento entrar.
          </p>
        </>
      )}
    </Casca>
  );
}

/** PC-20: sem limite definido não há vaga a contar — dizer "0 vagas" seria mentira. */
function vagasDe(saida: PublicSaida): string {
  if (saida.vacancies === null) return 'Vagas abertas';
  if (saida.vacancies <= 0) return 'Sem vaga — entre na lista de espera';
  return saida.vacancies === 1 ? 'Última vaga' : `${String(saida.vacancies)} vagas`;
}

function EstadoSemSaida({ titulo, linha }: { titulo: string; linha: string }): React.JSX.Element {
  return (
    <div className="state">
      <div className="state-text">
        <span className="state-title">{titulo}</span>
        <span className="state-line">{linha}</span>
      </div>
      <div className="state-grow" />
      <a
        className="btn btn-wa btn-ico"
        href={whatsappLink(TENANT_WHATSAPP, 'Olá! Vi o site e queria falar sobre uma expedição.')}
        target="_blank"
        rel="noreferrer"
      >
        <WhatsAppIcon />
        Falar com a equipe
      </a>
    </div>
  );
}

function Casca({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <main className="page pub-page">{children}</main>;
}
