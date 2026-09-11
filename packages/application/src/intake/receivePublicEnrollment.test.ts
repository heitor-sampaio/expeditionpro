import { describe, expect, it } from 'vitest';
import { parseLocalDate } from '@expedition/domain';
import { fakeIntakeRepository } from './intakeRepository.fake.js';
import { fakeScheduleRepository } from '../schedule/scheduleRepository.fake.js';
import { receivePublicEnrollment } from './receivePublicEnrollment.js';
import { NotFoundError } from '../errors.js';
import type { PublicItinerary, ScheduleRepository } from '../schedule/scheduleRepository.js';

/**
 * IN-25b — a inscrição que chega pela página pública.
 *
 * Ela entra na fila como qualquer outra (decisão de 2026-08-28), com uma diferença que é o
 * ponto da fatia: **a saída já vem escolhida**, porque o link disse qual era. A equipe abre a
 * fila e aloca num clique, em vez de adivinhar a data.
 *
 * É a primeira escrita do sistema **sem segredo nenhum** — a página é pública e qualquer chave
 * embutida nela vazaria no primeiro "ver código-fonte". O que contém isso não está aqui: é a
 * fila, que não deixa nada virar cliente ou inscrição sem alguém alocar.
 */

const AGORA = new Date('2026-09-11T15:00:00.000Z');

const roteiro: PublicItinerary = {
  tenantId: 'tenant-a',
  itineraryId: 'itin-1',
  itineraryName: 'Coxilha Rica',
  itinerarySlug: 'coxilha-rica',
  groups: [
    {
      groupId: 'g-jan',
      name: 'Coxilha Rica · 15/01/2027',
      startDate: parseLocalDate('2027-01-15'),
      endDate: parseLocalDate('2027-01-18'),
      vacancies: 4,
    },
  ],
};

function deps(achado: PublicItinerary | null = roteiro) {
  const intake = fakeIntakeRepository();
  const schedule = {
    ...fakeScheduleRepository(),
    findPublicItineraryBySlug: () => Promise.resolve(achado),
  } as unknown as ScheduleRepository;
  return { intake, schedule, clock: () => AGORA };
}

const corpo = (cpf = '900.000.100-57') => ({
  responsible: {
    full_name: 'Vanessa Santos',
    cpf,
    birth_date: '1989-01-14',
    email: 'vanessa@exemplo.com',
    phone: '48999998877',
  },
  companions: [{ full_name: 'Ana Prado', cpf: '111.444.777-35', birth_date: '2015-03-22' }],
  consent: true,
});

const comando = (extra: Record<string, unknown> = {}) => ({
  tenantSlug: 'drk',
  itinerarySlug: 'coxilha-rica',
  groupId: 'g-jan',
  body: corpo(),
  link: { roteiro: 'coxilha-rica', saida: 'jan-27' },
  ...extra,
});

describe('IN-25b: a inscrição pública entra na fila', () => {
  it('entra como needs_allocation, com a origem do site', async () => {
    const d = deps();

    const { status } = await receivePublicEnrollment(d, comando());

    expect(status).toBe('queued');
    expect(d.intake.rows[0]).toMatchObject({
      source: 'site',
      status: 'needs_allocation',
      itineraryId: 'itin-1',
    });
  });

  /** É o que a equipe vê na fila: a saída já escolhida, sem ter de adivinhar a data. */
  it('a saída do link fica no payload, para a fila apontá-la', async () => {
    const d = deps();

    await receivePublicEnrollment(d, comando());

    expect(d.intake.rows[0]?.payload).toMatchObject({
      kind: 'site_enrollment',
      groupId: 'g-jan',
      link: { saida: 'jan-27' },
    });
  });

  /**
   * **O servidor nunca confia no `groupId` do navegador.** Ele é conferido contra as saídas do
   * roteiro que o link apontou — sem isso, dava para inscrever alguém numa saída privada, ou na
   * de outro roteiro, só editando a URL.
   */
  it('grupo que não é do roteiro do link é recusado', async () => {
    const d = deps();

    await expect(
      receivePublicEnrollment(d, comando({ groupId: 'g-de-outro-roteiro' })),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(d.intake.rows).toHaveLength(0);
  });

  it('roteiro que não é de vitrine é recusado', async () => {
    const d = deps(null);

    await expect(receivePublicEnrollment(d, comando())).rejects.toBeInstanceOf(NotFoundError);
  });

  /** A data pretendida é a da saída resolvida — não o que o navegador mandou. */
  it('a data pretendida é a da saída, e vem do servidor', async () => {
    const d = deps();

    await receivePublicEnrollment(d, comando());

    expect(d.intake.rows[0]?.normalized).toMatchObject({
      desiredDate: { year: 2027, month: 1, day: 15 },
    });
  });

  /**
   * Duplo clique no celular — e ele acontece, porque a resposta demora o tempo de uma rede
   * móvel. A segunda submissão é a mesma inscrição, e a fila não pode mostrar a família duas
   * vezes.
   */
  it('a segunda submissão da mesma pessoa na mesma saída é duplicata', async () => {
    const d = deps();
    await receivePublicEnrollment(d, comando());

    const { status } = await receivePublicEnrollment(d, comando());

    expect(status).toBe('duplicate');
    expect(d.intake.rows).toHaveLength(1);
  });

  /**
   * IN-05 — CPF inválido bloqueia, **e o payload fica guardado**. Quem digitou errado merece o
   * campo culpado de volta; e a equipe, um item reprocessável em vez de uma inscrição perdida.
   */
  it('CPF inválido é recusado, e o que a pessoa digitou não se perde', async () => {
    const d = deps();

    await expect(
      receivePublicEnrollment(d, comando({ body: corpo('111.111.111-11') })),
    ).rejects.toMatchObject({ field: 'responsible.cpf' });

    expect(d.intake.rows[0]).toMatchObject({ status: 'error' });
    expect(d.intake.rows[0]?.payload).toMatchObject({ kind: 'site_enrollment' });
  });
});
