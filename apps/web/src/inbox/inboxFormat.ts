import { formatPhone } from '@expedition/domain';

export type Channel = 'whatsapp' | 'instagram' | 'messenger';

const NOMES: Record<Channel, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  messenger: 'Messenger',
};

export function channelLabel(channel: Channel): string {
  return NOMES[channel];
}

/**
 * AT-07 — quem está do outro lado da conversa.
 *
 * No WhatsApp, sem nome de perfil, o telefone formatado ainda identifica: quem atende
 * reconhece o DDD e o número que acabou de ligar. Fora dele o id é **opaco por aplicativo**
 * (PSID/IGSID) — não é telefone, não é arroba, não abre nada —, então mostrá-lo fingiria que
 * significa alguma coisa. Melhor dizer que a pessoa não se identificou e deixar a equipe
 * batizar o contato pela conversa.
 *
 * O mesmo vale para o LID do WhatsApp (AT-05): é id de conta, não número.
 */
export function contactTitle(conversation: {
  channel: Channel;
  phone: string | null;
  displayName: string | null;
}): string {
  if (conversation.displayName) return conversation.displayName;
  /*
   * AT-05 — o telefone, e **nunca** o id do canal.
   *
   * A conversa passou a ser identificada pelo LID, que é um id de conta com cara de número:
   * formatá-lo daria algo como `+18 (76)54321-0987` — um telefone que não existe, na cara de
   * quem atende. Sem número, o honesto é dizer que não temos.
   */
  if (conversation.phone !== null) return formatPhone(conversation.phone);
  if (conversation.channel === 'whatsapp') return 'Contato sem número';
  return `Contato do ${channelLabel(conversation.channel)}`;
}

/** Iniciais do avatar. Nunca vazio: bolinha em branco parece falha de carregamento. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const primeira = partes[0]![0]!;
  const ultima = partes.length > 1 ? partes[partes.length - 1]![0]! : '';
  return (primeira + ultima).toUpperCase();
}
