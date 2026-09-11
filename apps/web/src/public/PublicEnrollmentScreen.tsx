import { useState } from 'react';
import { formatDateRangeLong } from '../ui/format.js';
import { whatsappLink } from '../ui/whatsapp.js';
import { WhatsAppIcon } from '../ui/WhatsAppIcon.js';
import { TENANT_WHATSAPP } from '../tenant.js';
import { usePublicEnrollmentLink, type PublicSaida } from './usePublicEnrollmentLink.js';
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
  const selecionada = view.match ?? view.alternatives.find((s) => s.groupId === escolhida) ?? null;
  const atual = escolhida ?? view.match?.groupId ?? null;
  const semNenhuma = view.match === null && view.alternatives.length === 0;

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
            <span className="field-label">
              {view.match === null ? 'Escolha a saída' : 'Sua saída'}
            </span>

            <div className="enroll-list">
              {[...(view.match === null ? [] : [view.match]), ...view.alternatives].map((saida) => (
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
              ))}
            </div>
          </section>

          {/*
           * A inscrição em si chega na próxima fatia. Até lá o botão leva ao WhatsApp, que é o
           * funil que já existe — e já leva a saída escolhida no texto, para a equipe não
           * precisar perguntar.
           */}
          <a
            className="btn btn-primary btn-wa btn-ico pub-cta"
            href={whatsappLink(
              TENANT_WHATSAPP,
              selecionada === null
                ? `Olá! Quero me inscrever na ${view.itineraryName}.`
                : `Olá! Quero me inscrever na ${view.itineraryName}, saída de ${formatDateRangeLong(selecionada.startDate, selecionada.endDate)}.`,
            )}
            target="_blank"
            rel="noreferrer"
          >
            <WhatsAppIcon />
            Quero me inscrever
          </a>
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
