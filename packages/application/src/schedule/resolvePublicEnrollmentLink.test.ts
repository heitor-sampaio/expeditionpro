import { describe, expect, it } from 'vitest';
import { parseLocalDate } from '@expedition/domain';
import { resolvePublicEnrollmentLink } from './resolvePublicEnrollmentLink.js';
import type { PublicItinerary, ScheduleRepository } from './scheduleRepository.js';

/**
 * IN-25 — o que a página pública precisa saber para abrir.
 *
 * O botão do site manda `?roteiro=coxilha-rica&saida=jan-27`, e daqui sai tudo o que a tela
 * mostra: o nome do roteiro, a saída escolhida e as outras datas. É a única leitura do sistema
 * que responde a um estranho, e por isso ela devolve **só** o que vai na tela.
 */

const HOJE = parseLocalDate('2026-09-11');

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
    {
      groupId: 'g-fev',
      name: 'Coxilha Rica · 20/02/2027',
      startDate: parseLocalDate('2027-02-20'),
      endDate: parseLocalDate('2027-02-23'),
      vacancies: null,
    },
  ],
};

function deps(achado: PublicItinerary | null) {
  return {
    schedule: {
      findPublicItineraryBySlug: () => Promise.resolve(achado),
    } as unknown as ScheduleRepository,
  };
}

describe('IN-25: o link público abre a página certa', () => {
  it('com o mês do link, devolve a saída daquele mês', async () => {
    const visao = await resolvePublicEnrollmentLink(deps(roteiro), {
      tenantSlug: 'drk',
      itinerarySlug: 'coxilha-rica',
      saida: 'jan-27',
      hoje: HOJE,
    });

    expect(visao?.itineraryName).toBe('Coxilha Rica');
    expect(visao?.match?.groupId).toBe('g-jan');
    expect(visao?.alternatives.map((g) => g.groupId)).toEqual(['g-fev']);
  });

  /**
   * O anúncio continua rodando depois de a saída fechar. Quem clica em março num link de
   * janeiro não pode cair num "link inválido" e ir embora — as outras datas ficam à vista.
   */
  it('mês sem saída abre a página assim mesmo, com as outras datas', async () => {
    const visao = await resolvePublicEnrollmentLink(deps(roteiro), {
      tenantSlug: 'drk',
      itinerarySlug: 'coxilha-rica',
      saida: 'jul-27',
      hoje: HOJE,
    });

    expect(visao?.match).toBeNull();
    expect(visao?.alternatives).toHaveLength(2);
  });

  /**
   * Mês ilegível é o mesmo caso: o link errado não fecha a porta. E `saidaReconhecida` diz à
   * tela a diferença entre "o link não trouxe data" e "o link trouxe uma data que não entendi",
   * que são frases diferentes para quem está lendo.
   */
  it('mês que não se lê abre a página, dizendo que não foi reconhecido', async () => {
    const visao = await resolvePublicEnrollmentLink(deps(roteiro), {
      tenantSlug: 'drk',
      itinerarySlug: 'coxilha-rica',
      saida: 'xpto',
      hoje: HOJE,
    });

    expect(visao?.match).toBeNull();
    expect(visao?.saidaReconhecida).toBe(false);
    expect(visao?.alternatives).toHaveLength(2);
  });

  it('sem mês no link, abre com todas as datas', async () => {
    const visao = await resolvePublicEnrollmentLink(deps(roteiro), {
      tenantSlug: 'drk',
      itinerarySlug: 'coxilha-rica',
      hoje: HOJE,
    });

    expect(visao?.saidaReconhecida).toBe(true);
    expect(visao?.alternatives).toHaveLength(2);
  });

  /**
   * **A recusa é uma só.** Tenant que não existe, roteiro que não existe e roteiro que não é
   * de vitrine devolvem a mesma coisa. Separar os casos deixaria contar, por tentativa, quais
   * empresas usam o sistema e quais roteiros elas têm — a mesma razão pela qual os webhooks
   * respondem 401 sem distinguir slug de segredo.
   */
  it('roteiro que não é público não existe para quem pergunta', async () => {
    const visao = await resolvePublicEnrollmentLink(deps(null), {
      tenantSlug: 'drk',
      itinerarySlug: 'roteiro-privado',
      saida: 'jan-27',
      hoje: HOJE,
    });

    expect(visao).toBeNull();
  });
});
