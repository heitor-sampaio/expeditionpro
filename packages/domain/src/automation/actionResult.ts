/**
 * AU-23 — o que a ação respondeu, virando variável do fluxo.
 *
 * Sem isto, uma ação só deixava rastro no log: dava para ver a resposta do parceiro depois,
 * mas não para **usar** a resposta no bloco seguinte. Guardar sob um nome é o que fecha o
 * ciclo — chamar uma URL, ler o que voltou e decidir com aquilo.
 *
 * O nome tem que ser identificador de verdade porque o texto alcança as variáveis por
 * caminho: guardado como "minha resposta", nada em `{{...}}` chegaria lá. Recusar aqui é
 * melhor que aceitar e criar dado que ninguém consegue ler.
 *
 * Sobrescrever uma chave que o gatilho trouxe é permitido de propósito: quem desenha o fluxo
 * manda no contexto dele, e proibir seria adivinhar o que a pessoa quis.
 */

const IDENTIFICADOR = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function actionResultName(config: Record<string, unknown>): string | null {
  const bruto = config['saveAs'];
  if (typeof bruto !== 'string') return null;

  const nome = bruto.trim();
  return IDENTIFICADOR.test(nome) ? nome : null;
}
