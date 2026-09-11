/**
 * IN-25b — o que faz duas submissões serem a mesma inscrição.
 *
 * O webhook deduplica por `{form_id}:{entry_id}`, que o formulário do WordPress fornece. A
 * página pública não tem nada disso: quem toca o botão duas vezes no celular — e toca, porque
 * a resposta demora o tempo de uma rede móvel — mandaria duas vezes, e a equipe abriria a fila
 * com a mesma família repetida.
 *
 * **A mesma pessoa, na mesma saída, é a mesma inscrição.** Grupo e não dia, porque a data mora
 * no evento de agenda e o grupo já a implica — e porque é o `groupId` que o **servidor**
 * resolveu a partir do link, nunca o que o navegador mandou.
 *
 * Sem hash, de propósito: hashear isto enquanto o CPF em claro está no `payload` da mesma linha
 * seria teatro, e exigiria criptografia numa camada que é pura de propósito. Quem lê o
 * `external_id` é a equipe, que já vê o CPF completo por decisão do dono.
 *
 * Uma função de uma linha num arquivo próprio parece exagero — mas é a linha que decide o que é
 * a mesma inscrição, e ela merece um nome e um teste.
 */
export function publicEnrollmentExternalId(groupId: string, cpf: string): string {
  return `${groupId}:${cpf.replace(/\D/g, '')}`;
}
