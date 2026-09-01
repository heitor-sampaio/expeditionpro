/**
 * Link de conversa no WhatsApp com um texto já digitado. O `wa.me` só entende dígitos
 * (com DDI), então a máscara cai aqui — quem chama passa o número como tiver.
 */
export function whatsappLink(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}
