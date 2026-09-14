import { useState } from 'react';
import { publicApi, PUBLIC_TENANT_SLUG } from './publicApi.js';
import { corpoDaInscricao, type DadosDoLink, type EnrollmentForm } from './enrollmentForm.js';

/**
 * IN-25b — o envio da inscrição.
 *
 * Sem retentativa automática: uma inscrição reenviada sozinha é a família duas vezes na fila.
 * O servidor deduplica pela mesma pessoa na mesma saída, mas contar com isso para desenhar a
 * tela seria escrever um defeito e confiar que outro o conserta.
 */

export type EnvioState =
  | { status: 'form' }
  | { status: 'sending' }
  | { status: 'done' }
  /** A mensagem já sai pronta para ler: quem preencheu não deve traduzir código de erro. */
  | { status: 'error'; message: string };

export function useEnviarInscricao(): {
  state: EnvioState;
  enviar: (form: EnrollmentForm, link: DadosDoLink) => Promise<void>;
} {
  const [state, setState] = useState<EnvioState>({ status: 'form' });

  const enviar = async (form: EnrollmentForm, link: DadosDoLink): Promise<void> => {
    setState({ status: 'sending' });
    try {
      const res = await publicApi(
        `/v1/public/${encodeURIComponent(PUBLIC_TENANT_SLUG)}/enrollments`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(corpoDaInscricao(form, link)),
        },
      );

      // 200 é duplicata — do ponto de vista de quem enviou, deu certo do mesmo jeito: a
      // inscrição dela está lá. Dizer "já existe" assustaria sem necessidade.
      if (res.ok) {
        setState({ status: 'done' });
        return;
      }
      setState({ status: 'error', message: await mensagemDe(res) });
    } catch {
      setState({
        status: 'error',
        message: 'Não deu para enviar. Verifique a conexão e tente de novo.',
      });
    }
  };

  return { state, enviar };
}

async function mensagemDe(res: Response): Promise<string> {
  if (res.status === 429) {
    return 'Muitas tentativas em pouco tempo. Espere um minuto e tente de novo.';
  }
  if (res.status === 404) {
    return 'Este grupo não está mais aberto. Escolha outra data.';
  }
  if (res.status === 422) {
    // O servidor diz o campo culpado; a tela diz o que fazer com ele.
    const corpo = (await res.json().catch(() => null)) as {
      fields?: Record<string, string>;
    } | null;
    const campo = Object.keys(corpo?.fields ?? {})[0];
    return campo === undefined
      ? 'Confira os dados: algum campo não está no formato esperado.'
      : `Confira o campo ${rotuloDe(campo)}: o valor não parece válido.`;
  }
  return 'Não deu para enviar agora. Tente de novo em instantes.';
}

/** O servidor fala em `responsible.cpf`; quem preencheu, em "CPF". */
function rotuloDe(campo: string): string {
  const nomes: Record<string, string> = {
    'responsible.full_name': 'nome',
    'responsible.cpf': 'CPF',
    'responsible.birth_date': 'data de nascimento',
    'responsible.email': 'e-mail',
    'responsible.phone': 'telefone',
  };
  if (nomes[campo]) return nomes[campo];
  // `companions[0].cpf` → "CPF do 1º acompanhante"
  const acompanhante = /^companions\[(\d+)\]\.(\w+)$/.exec(campo);
  if (acompanhante === null) return campo;
  const posicao = Number(acompanhante[1]) + 1;
  const qual = nomes[`responsible.${acompanhante[2]!}`] ?? acompanhante[2]!;
  return `${qual} do ${String(posicao)}º acompanhante`;
}
