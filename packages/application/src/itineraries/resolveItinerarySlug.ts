import { itinerarySlug } from '@expedition/domain';
import { BusinessRuleError } from '../errors.js';
import type { ItineraryRepository } from './itineraryRepository.js';

/**
 * RO-02 — normaliza o endereço do roteiro e confere que ele está livre no tenant.
 *
 * A conferência é explícita, e não uma tradução de `P2002`, porque a colisão aqui é o caso
 * comum e não o excepcional: dois roteiros com nomes parecidos produzem o mesmo slug, e quem
 * está digitando precisa ler *qual* endereço já está ocupado, não um erro de banco. O unique
 * composto continua sendo a última palavra — ele é que fecha a corrida entre duas pessoas
 * salvando no mesmo segundo, que aqui é improvável e lá é impossível.
 *
 * `exceptId` existe porque salvar o próprio roteiro com o slug que ele já tem não é colisão.
 */
export async function resolveItinerarySlug(
  itineraries: ItineraryRepository,
  tenantId: string,
  bruto: string,
  exceptId?: string,
): Promise<string> {
  const slug = itinerarySlug(bruto);
  if (slug === null) {
    throw new BusinessRuleError(
      'invalid_slug',
      'O endereço do roteiro precisa ter ao menos uma letra ou número',
    );
  }

  const ocupado = await itineraries.findBySlug(tenantId, slug);
  if (ocupado && ocupado.id !== exceptId) {
    throw new BusinessRuleError('slug_taken', `O endereço "${slug}" já é de outro roteiro`);
  }
  return slug;
}
