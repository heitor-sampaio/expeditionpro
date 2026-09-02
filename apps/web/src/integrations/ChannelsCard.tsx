import { useState } from 'react';
import { API_BASE } from '../auth/apiUrl.js';
import { evolutionWebhookUrl } from './webhookUrl.js';
import { InvalidIpError, parseAllowedIps } from '@expedition/domain';
import { channelLabel, type Channel } from '../inbox/inboxFormat.js';
import {
  useChannelIntegrations,
  type ChannelIntegration,
  type ChannelResult,
  type ConnectChannelInput,
} from './useChannelIntegrations.js';

/**
 * AT-01 — conexão dos canais de mensagem.
 *
 * Mesmo peso do gateway de pagamento, e por isso o mesmo desenho: a chave só vai para o
 * servidor, o que volta é o fim dela, e o segredo do webhook aparece uma única vez. Quem tem
 * essa chave manda mensagem **como a empresa**, para qualquer número da agenda.
 *
 * Só o WhatsApp entra agora. Instagram e Messenger passam pela Meta, cuja autenticação de
 * webhook é outra (assinatura HMAC do corpo, não segredo no cabeçalho) — colocá-los aqui antes
 * de o servidor entender aquela assinatura ofereceria um botão que não conecta nada.
 */
export function ChannelsCard(): React.JSX.Element {
  const { state, refresh, busy, connect, disconnect } = useChannelIntegrations();

  return (
    <section className="card">
      <div className="panel-head">
        <h2 className="card-title">Canais de mensagem</h2>
      </div>
      <p className="field-help">
        Traz a conversa do WhatsApp para dentro do sistema: o que chegar aparece em CRM → Conversas,
        e pode ser ligado a uma oportunidade do funil.
      </p>

      {state.status === 'loading' && (
        <div className="skel-card" aria-hidden>
          <div className="skel-bars">
            <div className="skel-bar" />
            <div className="skel-bar short" />
          </div>
        </div>
      )}

      {state.status === 'error' && (
        <div className="state" role="alert">
          <div className="state-text">
            <span className="state-title">Não deu para carregar os canais</span>
            <span className="state-line is-error">Verifique a conexão e tente de novo.</span>
          </div>
          <div className="state-grow" />
          <button type="button" className="btn btn-secondary" onClick={refresh}>
            Tentar de novo
          </button>
        </div>
      )}

      {state.status === 'forbidden' && (
        <div className="state">
          <div className="state-text">
            <span className="state-title">Sem acesso aos canais</span>
            <span className="state-line">Conectar um canal é de owner ou admin.</span>
          </div>
          <div className="state-grow" />
        </div>
      )}

      {state.status === 'ready' && (
        <ChannelBlock
          channel="whatsapp"
          connected={state.rows.find((row) => row.channel === 'whatsapp') ?? null}
          busy={busy}
          onConnect={connect}
          onDisconnect={disconnect}
        />
      )}
    </section>
  );
}

function ChannelBlock({
  channel,
  connected,
  busy,
  onConnect,
  onDisconnect,
}: {
  channel: Channel;
  connected: ChannelIntegration | null;
  busy: boolean;
  onConnect: (dados: ConnectChannelInput) => Promise<ChannelResult>;
  onDisconnect: (channel: Channel) => Promise<ChannelResult>;
}): React.JSX.Element {
  const [baseUrl, setBaseUrl] = useState('');
  const [instancia, setInstancia] = useState('');
  const [chave, setChave] = useState('');
  const [origens, setOrigens] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  // Só existe na resposta da conexão: some ao sair da tela, como o token de API.
  const [webhookToken, setWebhookToken] = useState<string | null>(null);

  const act = async (promessa: Promise<ChannelResult>) => {
    setErro(null);
    const resultado = await promessa;
    if (resultado.ok) {
      setChave('');
      setEditando(false);
      if (resultado.webhookToken) setWebhookToken(resultado.webhookToken);
    } else {
      setErro(resultado.message);
    }
  };

  const preenchido = baseUrl.trim() !== '' && instancia.trim() !== '' && chave.trim() !== '';

  /**
   * Confere os endereços aqui antes de mandar, para o erro sair sem ida ao servidor. Lá a
   * mesma conferência acontece de novo — borda não confia em cliente.
   */
  const conectar = () => {
    let allowedIps: string[];
    try {
      allowedIps = parseAllowedIps(origens);
    } catch (erroDeIp) {
      setErro(
        erroDeIp instanceof InvalidIpError
          ? `${erroDeIp.value} não é um endereço IP.`
          : 'Endereço liberado inválido.',
      );
      return;
    }
    void act(
      onConnect({
        channel,
        provider: 'evolution',
        baseUrl: baseUrl.trim(),
        externalAccountId: instancia.trim(),
        accessToken: chave.trim(),
        allowedIps,
      }),
    );
  };

  return (
    <div className="rowpanel-block">
      <div className="panel-head">
        <span className="field-label form-subhead">{channelLabel(channel)}</span>
        <span className={`pill ${connected ? 'pill-go' : 'pill-neutral'}`}>
          {connected ? 'conectado' : 'desconectado'}
        </span>
      </div>

      {connected && !editando ? (
        <>
          <p className="field-help">
            Instância {connected.externalAccountId} em {connected.baseUrl} · chave{' '}
            {connected.tokenPreview} · desde {formatDate(connected.connectedAt)}
          </p>
          <p className="field-help">
            {connected.allowedIps.length > 0
              ? `Recebe só de ${connected.allowedIps.join(', ')}.`
              : 'Sem endereço liberado: só entra quem apresentar o segredo.'}
          </p>
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() => {
                setBaseUrl(connected.baseUrl);
                setInstancia(connected.externalAccountId);
                setOrigens(connected.allowedIps.join('\n'));
                setEditando(true);
              }}
            >
              Trocar chave
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm btn-danger"
              disabled={busy}
              onClick={() => void act(onDisconnect(channel))}
            >
              Desconectar
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="field-help">
            Dados da sua instância na Evolution API. O número segue pareado por QR code no painel
            dela — aqui só entra o endereço e a chave.
          </p>
          <div className="form-grid">
            <label className="field">
              <span className="field-label">Endereço da instância</span>
              <input
                className="field-input"
                value={baseUrl}
                autoComplete="off"
                placeholder="https://evolution.seudominio.com.br"
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">Nome da instância</span>
              <input
                className="field-input"
                value={instancia}
                autoComplete="off"
                placeholder="drakkar"
                onChange={(e) => setInstancia(e.target.value)}
              />
            </label>
            <label className="field field-wide">
              <span className="field-label">Chave de API</span>
              <input
                className="field-input is-mono"
                type="password"
                value={chave}
                autoComplete="off"
                onChange={(e) => setChave(e.target.value)}
              />
            </label>
            {/*
              AT-02 — a saída para instalação que não deixa configurar nada na chamada. É IP e
              não domínio porque a requisição que chega não carrega URL nenhuma: carrega o
              endereço de quem conectou. Domínio precisaria ser resolvido, e a resolução pode
              apontar para outro lugar que não o de onde a mensagem sai — falha silenciosa.
            */}
            <label className="field field-wide">
              <span className="field-label">Endereços liberados (opcional)</span>
              <textarea
                className="field-input field-textarea is-mono"
                rows={2}
                value={origens}
                placeholder="69.62.88.81"
                onChange={(e) => setOrigens(e.target.value)}
              />
              <span className="field-help">
                IP do servidor onde a Evolution roda, um por linha. Preenchido, ele passa a
                autenticar sozinho — e aí a URL do webhook não precisa levar segredo nenhum. Vazio,
                só o segredo vale.
              </span>
            </label>
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || !preenchido}
              onClick={conectar}
            >
              Conectar
            </button>
            {editando && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setEditando(false);
                  setChave('');
                }}
              >
                Cancelar
              </button>
            )}
          </div>
        </>
      )}

      {webhookToken && (
        <div className="key-fresh">
          <span className="field-label">Cole esta URL no webhook da Evolution</span>
          <p className="field-help">
            <code className="mono">{webhookUrl(webhookToken)}</code>
          </p>
          <p className="field-help">
            Marque o evento <code>messages.upsert</code> e deixe <em>webhook by events</em>{' '}
            desligado.
          </p>
          {/*
            O segredo está dentro da URL, então o aviso não é sobre "um token": é sobre o
            endereço inteiro. Quem tiver esta linha manda mensagem para dentro do sistema.
          */}
          <p className="field-help">
            <strong>Esta URL é uma senha.</strong> Ela aparece uma única vez — o sistema guarda só
            um resumo dela, nunca o valor. Copie agora, e não cole em lugar público.
          </p>
          <p className="field-help">
            Se a sua Evolution tiver campo de cabeçalho, prefira ele: cadastre a URL sem o último
            trecho e mande <code className="mono">x-webhook-token: {webhookToken}</code>. Cabeçalho
            não passa por log de proxy nem por histórico de navegador.
          </p>
        </div>
      )}

      {connected && !webhookToken && (
        <p className="field-help">
          Na Evolution, o webhook aponta para <code>{webhookUrl()}</code> seguido do segredo, com o
          evento <code>messages.upsert</code>. O segredo foi mostrado ao conectar e não pode ser
          lido de novo. Trocar a chave <strong>mantém o mesmo segredo</strong>, para a mensagem não
          parar de chegar. Se ele se perdeu, desconecte e conecte de novo: aí nasce outro, e a URL
          precisa ser atualizada lá.
        </p>
      )}

      {erro && (
        <div className="feedback feedback-error" role="alert">
          <span className="feedback-dot" />
          <span>{erro}</span>
        </div>
      )}
    </div>
  );
}

function webhookUrl(token?: string): string {
  return evolutionWebhookUrl(import.meta.env['VITE_PUBLIC_API_URL'], API_BASE, token);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}
