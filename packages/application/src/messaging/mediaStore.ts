/**
 * AT-13 — onde o arquivo que o lead mandou fica guardado.
 *
 * A aplicação não sabe decodificar base64 nem falar com bucket nenhum: entrega o conteúdo
 * como veio e recebe de volta um caminho. Decodificar exigiria `Buffer`, que é do Node, e
 * este pacote é o mesmo que roda em qualquer lugar — a fronteira é justamente esta.
 *
 * **Guardar pode falhar sem derrubar a mensagem.** `save` devolve `null` quando não conseguiu:
 * o texto, o horário e o autor entram do mesmo jeito, e a conversa continua legível com o
 * marcador de anexo. Perder a mensagem inteira porque o arquivo não subiu seria trocar um
 * problema pequeno por um grande.
 */

export interface NewMedia {
  readonly tenantId: string;
  readonly conversationId: string;
  /** Id da mensagem no provedor: dá um nome estável ao arquivo e evita colisão. */
  readonly externalId: string;
  readonly mimeType: string;
  readonly fileName: string | null;
  readonly base64: string;
}

export interface StoredMedia {
  /** Caminho dentro do bucket. Nunca é URL: URL de mídia é assinada na hora de mostrar. */
  readonly path: string;
  readonly sizeBytes: number;
}

export interface MediaStore {
  save(media: NewMedia): Promise<StoredMedia | null>;
  /**
   * Assina os caminhos de uma vez. Um fio com dez fotos faria dez chamadas ao Storage se a
   * assinatura fosse uma por vez, e a tela esperaria por todas.
   */
  signedUrls(paths: readonly string[], ttlSeconds: number): Promise<ReadonlyMap<string, string>>;
}
