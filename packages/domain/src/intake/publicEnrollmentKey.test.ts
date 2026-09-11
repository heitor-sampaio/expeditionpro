import { describe, expect, it } from 'vitest';
import { publicEnrollmentExternalId } from './publicEnrollmentKey.js';

/**
 * IN-25b — o que faz duas submissões serem a mesma inscrição.
 *
 * O webhook deduplica por `{form_id}:{entry_id}`, que o formulário do WordPress fornece. A
 * página pública não tem nada disso: quem toca o botão duas vezes no celular — e toca, porque
 * a resposta demora o tempo de uma rede móvel — mandaria duas vezes.
 *
 * A mesma pessoa, na mesma saída, é a mesma inscrição. Grupo e não dia, porque a data mora no
 * evento e o grupo já a implica; e é o `groupId` que o servidor resolveu, não o que o navegador
 * mandou.
 */
describe('IN-25b: a mesma pessoa na mesma saída é uma inscrição só', () => {
  it('mesmo CPF no mesmo grupo dá a mesma chave', () => {
    expect(publicEnrollmentExternalId('g-1', '90000010057')).toBe(
      publicEnrollmentExternalId('g-1', '90000010057'),
    );
  });

  /** O CPF chega pontuado ou não, conforme o teclado e o navegador. É a mesma pessoa. */
  it('CPF com e sem pontuação dão a mesma chave', () => {
    expect(publicEnrollmentExternalId('g-1', '900.000.100-57')).toBe(
      publicEnrollmentExternalId('g-1', '90000010057'),
    );
  });

  it('a mesma pessoa em saídas diferentes são inscrições diferentes', () => {
    expect(publicEnrollmentExternalId('g-1', '90000010057')).not.toBe(
      publicEnrollmentExternalId('g-2', '90000010057'),
    );
  });

  it('pessoas diferentes na mesma saída são inscrições diferentes', () => {
    expect(publicEnrollmentExternalId('g-1', '90000010057')).not.toBe(
      publicEnrollmentExternalId('g-1', '11144477735'),
    );
  });

  /**
   * Sem hash, de propósito: hashear a chave enquanto o CPF em claro está no payload da mesma
   * linha seria teatro. Quem lê `external_id` é a equipe, que já vê o CPF completo por decisão
   * do dono.
   */
  it('a chave é legível: grupo e CPF, na ordem', () => {
    expect(publicEnrollmentExternalId('g-1', '900.000.100-57')).toBe('g-1:90000010057');
  });
});
