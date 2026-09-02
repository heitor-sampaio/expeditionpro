import { useCallback, useEffect, useRef, useState } from 'react';
import { semPrefixo } from './attachment.js';

/**
 * AT-13 — gravar uma mensagem de voz pela tela.
 *
 * O formato é escolhido por preferência, não fixado: o WhatsApp entende **opus**, e o
 * navegador entrega ogg ou webm dependendo de quem é. A ordem tenta primeiro o que chega mais
 * perto do que o aparelho espera, e a Evolution converte o resto — se ela recusar, o motivo
 * dela aparece na tela, que é o que permite trocar isto em dez minutos.
 *
 * O microfone é **desligado ao parar**, sempre. Faixa de áudio aberta deixa a luz da câmera ou
 * o indicador do sistema aceso, e é a diferença entre um aplicativo que grava quando você pede
 * e um que parece estar escutando.
 */

const FORMATOS = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm'];

export type RecorderState =
  | { status: 'parado' }
  | { status: 'gravando'; segundos: number }
  | { status: 'negado' }
  | { status: 'indisponivel' };

export interface Gravacao {
  readonly mimeType: string;
  readonly base64: string;
}

export function useVoiceRecorder(onPronto: (gravacao: Gravacao) => void) {
  const [state, setState] = useState<RecorderState>({ status: 'parado' });
  const recorder = useRef<MediaRecorder | null>(null);
  const pedacos = useRef<Blob[]>([]);
  const pronto = useRef(onPronto);
  pronto.current = onPronto;

  const desligar = useCallback(() => {
    recorder.current?.stream.getTracks().forEach((faixa) => {
      faixa.stop();
    });
    recorder.current = null;
  }, []);

  // Sair da tela no meio de uma gravação não pode deixar o microfone ligado.
  useEffect(() => desligar, [desligar]);

  useEffect(() => {
    if (state.status !== 'gravando') return;
    const timer = setInterval(() => {
      setState((atual) =>
        atual.status === 'gravando' ? { status: 'gravando', segundos: atual.segundos + 1 } : atual,
      );
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [state.status]);

  const gravar = useCallback(async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices) {
      setState({ status: 'indisponivel' });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = FORMATOS.find((formato) => MediaRecorder.isTypeSupported(formato));
      const gravador = new MediaRecorder(stream, mimeType === undefined ? {} : { mimeType });
      pedacos.current = [];

      gravador.ondataavailable = (evento) => {
        if (evento.data.size > 0) pedacos.current.push(evento.data);
      };
      gravador.onstop = () => {
        const blob = new Blob(pedacos.current, { type: gravador.mimeType });
        const leitor = new FileReader();
        leitor.onload = () => {
          pronto.current({
            mimeType: gravador.mimeType,
            base64: semPrefixo(String(leitor.result)),
          });
        };
        leitor.readAsDataURL(blob);
        desligar();
      };

      recorder.current = gravador;
      gravador.start();
      setState({ status: 'gravando', segundos: 0 });
    } catch {
      // Permissão negada ou nenhum microfone: a tela diz isso e o resto continua funcionando.
      setState({ status: 'negado' });
    }
  }, [desligar]);

  const parar = useCallback(() => {
    recorder.current?.stop();
    setState({ status: 'parado' });
  }, []);

  /** Descarta o que foi gravado: para o gravador sem entregar nada a quem chamou. */
  const descartar = useCallback(() => {
    const gravador = recorder.current;
    if (gravador !== null) {
      gravador.onstop = null;
      gravador.stop();
      desligar();
    }
    pedacos.current = [];
    setState({ status: 'parado' });
  }, [desligar]);

  return { state, gravar, parar, descartar };
}
