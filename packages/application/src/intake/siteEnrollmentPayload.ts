/**
 * IN-25b — o envelope de uma inscrição vinda do link público.
 *
 * O que a fila precisa ler está **no topo** (o grupo escolhido), e o que o mapeador precisa ler
 * está em `body` — chave escolhida de propósito, porque o perfil canônico já desembrulha `.body`
 * sozinho. É o que faz o envelope inteiro poder ser reprocessado sem código novo.
 */

/**
 * A origem, no vocabulário que o código já usa: o port documenta `site` ao lado de `portal`, e
 * a alocação trata tudo que não é `portal` como `webhook` — logo, **sem cashback**, que é o
 * certo aqui: quem chega por um anúncio pode nem ser cliente ainda (CB-09).
 */
export const SITE_SOURCE = 'site';

/**
 * `kind` próprio, e não `portal_enrollment` estendido: a alocação lê daquele o `headCustomerId`
 * e os `participantCustomerIds`, que a inscrição do site não tem — quem vem do link pode nem
 * existir como cliente ainda.
 */
export const SITE_ENROLLMENT_KIND = 'site_enrollment';

export interface SiteEnrollmentPayload {
  readonly kind: typeof SITE_ENROLLMENT_KIND;
  /** A saída que o link escolheu, já conferida contra o roteiro. A fila lê daqui. */
  readonly groupId: string;
  /** Como o link veio, cru — inclusive um mês que não se conseguiu ler. */
  readonly link: { readonly roteiro: string; readonly saida: string | null };
  /** IN-25d: a origem comercial. Informação de marketing, nunca identificador de pessoa. */
  readonly utm?: Record<string, string>;
  /** SEC/DOC-05: quem gravou. É a única prova de responsabilização numa escrita anônima. */
  readonly client?: { readonly ip: string | null; readonly userAgent: string | null };
  /** O corpo canônico. O mapeador o encontra sozinho. */
  readonly body: Record<string, unknown>;
}
