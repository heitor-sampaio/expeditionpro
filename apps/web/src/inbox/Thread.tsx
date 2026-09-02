import { useEffect, useRef, useState } from 'react';
import { whatsappLink } from '../ui/whatsapp.js';
import { kindOf, lerArquivo, tamanhoAceito, LIMITE_BYTES } from './attachment.js';
import { FormattedText } from './FormattedText.js';
import { channelLabel, contactTitle, iniciais } from './inboxFormat.js';
import { useVoiceRecorder } from './useVoiceRecorder.js';
import type { Anexo, Conversation, Message, MessageMedia } from './useInbox.js';

/**
 * §5.17 — o fio da conversa: cabeçalho preso, mensagens rolando e o composer no pé.
 *
 * Fica em arquivo próprio desde que ganhou anexo e gravação de voz: a tela da caixa passava de
 * 470 linhas, e o limite deste projeto é ~300. Separar aqui é natural — a lista e o fio mudam
 * por motivos diferentes.
 */

export type ResultadoDoEnvio = { ok: true } | { ok: false; message: string };

export function Thread({
  conversation,
  messages,
  onVoltar,
  onDetalhes,
  onEnviar,
}: {
  conversation: Conversation;
  messages: Message[];
  onVoltar: () => void;
  onDetalhes: () => void;
  onEnviar: (id: string, texto: string, anexo?: Anexo) => Promise<ResultadoDoEnvio>;
}): React.JSX.Element {
  const titulo = contactTitle(conversation);
  const fim = useRef<HTMLDivElement>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState('');
  const [anexo, setAnexo] = useState<Anexo | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const gravador = useVoiceRecorder((gravacao) => {
    setAnexo({
      kind: 'audio',
      mimeType: gravacao.mimeType,
      fileName: null,
      base64: gravacao.base64,
    });
  });

  const enviar = async () => {
    const conteudo = texto.trim();
    if ((conteudo === '' && anexo === null) || enviando) return;
    setEnviando(true);
    setErro(null);
    const resultado = await onEnviar(conversation.id, conteudo, anexo ?? undefined);
    setEnviando(false);
    // Só limpa quando saiu de verdade: apagar o que a pessoa escreveu (ou gravou) depois de
    // uma recusa a obrigaria a refazer, e a recusa costuma ser do provedor, não do conteúdo.
    if (resultado.ok) {
      setTexto('');
      setAnexo(null);
    } else {
      setErro(resultado.message);
    }
  };

  const escolher = async (file: File | undefined) => {
    if (file === undefined) return;
    setErro(null);
    if (!tamanhoAceito(file.size)) {
      // Barra aqui, antes de subir: o mesmo erro depois de um minuto de espera é pior.
      setErro(`Arquivo grande demais. O limite é ${Math.round(LIMITE_BYTES / 1024 / 1024)} MB.`);
      return;
    }
    setAnexo({
      kind: kindOf(file.type),
      mimeType: file.type === '' ? 'application/octet-stream' : file.type,
      fileName: file.name,
      base64: await lerArquivo(file),
    });
  };

  // Fio de conversa se lê pelo fim: é lá que está a mensagem que ainda não foi respondida.
  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' });
  }, [conversation.id, messages.length]);

  const gravando = gravador.state.status === 'gravando';

  return (
    <>
      <div className="inbox-head">
        <button type="button" className="btn btn-secondary btn-sm inbox-back" onClick={onVoltar}>
          Voltar
        </button>
        <span className="avatar">{iniciais(titulo)}</span>
        <div className="inbox-head-text">
          <span className="card-title">{titulo}</span>
          <span className="member-cpf">
            {channelLabel(conversation.channel)}
            {conversation.customer === null
              ? ' · contato solto'
              : ` · cliente: ${conversation.customer.name}`}
          </span>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm inbox-details"
          onClick={onDetalhes}
        >
          Detalhes
        </button>
        {/* Sem número não há link: `wa.me` com um LID abre uma conversa com ninguém. */}
        {conversation.channel === 'whatsapp' && conversation.phone !== null && (
          <a
            className="btn btn-secondary btn-sm"
            href={whatsappLink(conversation.phone, '')}
            target="_blank"
            rel="noreferrer"
          >
            Abrir no WhatsApp
          </a>
        )}
      </div>

      <div className="inbox-msgs">
        {messages.length === 0 ? (
          <p className="members-empty">Esta conversa ainda não tem mensagem.</p>
        ) : (
          messages.map((mensagem) => (
            <div
              key={mensagem.id}
              className={`inbox-msg${mensagem.direction === 'out' ? ' is-out' : ''}`}
            >
              {mensagem.media !== null && <AnexoNoFio media={mensagem.media} />}
              {/*
                Foto sem legenda chega com o marcador `[imagem]`, e repeti-lo embaixo da
                própria imagem é ruído. Com legenda, o texto é o que a pessoa quis dizer.
              */}
              {!ehMarcador(mensagem) && <FormattedText text={mensagem.body} />}
              <span className="inbox-msg-time">{hora(mensagem.sentAt)}</span>
            </div>
          ))
        )}
        <div ref={fim} />
      </div>

      {erro && (
        <div className="feedback feedback-error inbox-foot" role="alert">
          <span className="feedback-dot" />
          <span>{erro}</span>
        </div>
      )}

      {gravador.state.status === 'negado' && (
        <div className="feedback feedback-info inbox-foot" role="status">
          <span className="feedback-dot" />
          <span>Sem acesso ao microfone. Libere a permissão no navegador para gravar.</span>
        </div>
      )}

      {anexo !== null && (
        <div className="inbox-anexo inbox-foot">
          <span className="inbox-anexo-nome">{descreve(anexo)}</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setAnexo(null);
            }}
          >
            Remover
          </button>
        </div>
      )}

      <div className="inline-form inbox-foot inbox-composer">
        <input
          ref={arquivo}
          type="file"
          className="inbox-file"
          aria-label="Escolher arquivo"
          onChange={(e) => {
            void escolher(e.target.files?.[0]);
            // Permite escolher o mesmo arquivo de novo depois de remover.
            e.target.value = '';
          }}
        />
        <button
          type="button"
          className="inbox-tool"
          aria-label="Anexar arquivo"
          disabled={enviando || gravando}
          onClick={() => arquivo.current?.click()}
        >
          <ClipeIcon />
        </button>
        <button
          type="button"
          className={`inbox-tool${gravando ? ' is-recording' : ''}`}
          aria-label={gravando ? 'Parar gravação' : 'Gravar áudio'}
          disabled={enviando}
          onClick={() => (gravando ? gravador.parar() : void gravador.gravar())}
        >
          <MicIcon />
        </button>
        {gravador.state.status === 'gravando' ? (
          <span className="inbox-timer">{relogio(gravador.state.segundos)}</span>
        ) : (
          <input
            className="field-input"
            value={texto}
            maxLength={4000}
            disabled={enviando}
            aria-label="Escreva a resposta"
            placeholder={anexo === null ? 'Escreva a resposta' : 'Legenda (opcional)'}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void enviar();
            }}
          />
        )}
        {gravando ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              gravador.descartar();
            }}
          >
            Descartar
          </button>
        ) : (
          <button
            type="button"
            className="inline-send"
            aria-label="Enviar resposta"
            disabled={enviando || (texto.trim() === '' && anexo === null)}
            onClick={() => void enviar()}
          >
            <SendIcon />
          </button>
        )}
      </div>
    </>
  );
}

/**
 * AT-13 — o anexo, mostrado pelo que ele é.
 *
 * Imagem e vídeo aparecem no fio: é o ponto de ver a mídia sem sair do sistema. Áudio ganha o
 * player do navegador, que já traz controle de tempo e velocidade. Documento vira link com
 * nome e tamanho — abrir um PDF dentro de um balão de conversa não ajuda ninguém.
 */
function AnexoNoFio({ media }: { media: MessageMedia }): React.JSX.Element {
  if (media.kind === 'image' || media.kind === 'sticker') {
    return (
      <a href={media.url} target="_blank" rel="noreferrer" className="inbox-media">
        <img src={media.url} alt="Imagem da conversa" loading="lazy" />
      </a>
    );
  }
  if (media.kind === 'video') {
    return <video className="inbox-media" src={media.url} controls preload="metadata" />;
  }
  if (media.kind === 'audio') {
    return <audio className="inbox-audio" src={media.url} controls preload="metadata" />;
  }
  return (
    <a href={media.url} target="_blank" rel="noreferrer" className="inbox-doc">
      <span className="inbox-doc-name">{media.fileName ?? 'Documento'}</span>
      <span className="inbox-doc-size">{tamanho(media.sizeBytes)}</span>
    </a>
  );
}

const ESPECIE: Record<Anexo['kind'], string> = {
  image: 'Imagem',
  video: 'Vídeo',
  audio: 'Áudio gravado',
  document: 'Documento',
};

function descreve(anexo: Anexo): string {
  return anexo.fileName ?? ESPECIE[anexo.kind];
}

/** Marcador de mídia sem legenda: com o anexo à vista, repetir "[imagem]" é ruído. */
function ehMarcador(mensagem: Message): boolean {
  return mensagem.media !== null && /^\[[^\]]+\]$/.test(mensagem.body);
}

function tamanho(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function relogio(segundos: number): string {
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`;
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/* Ícones locais, como na comunidade: a terceira cópia é que vira componente comum. */

function SendIcon(): React.JSX.Element {
  return (
    <svg {...ICONE} width="16" height="16">
      <path d="m4 12 16-8-6 8 6 8z" />
    </svg>
  );
}

function ClipeIcon(): React.JSX.Element {
  return (
    <svg {...ICONE} width="18" height="18">
      <path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7" />
    </svg>
  );
}

function MicIcon(): React.JSX.Element {
  return (
    <svg {...ICONE} width="18" height="18">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

const ICONE = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;
