import { describe, expect, it } from 'vitest';
import type { CashbackConfig } from '@expedition/domain';
import { fakeAuditLogRepository } from './audit/auditLogRepository.fake.js';
import { fakeCashbackRepository } from './cashback/cashbackRepository.fake.js';
import { fakeCommunityRepository } from './community/communityRepository.fake.js';
import { updateCashbackConfig } from './cashback/manageCashbackConfig.js';
import { moderatePost } from './community/moderatePost.js';
import type { RequestContext } from './context.js';

const admin: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u-admin', role: 'admin' },
};

const CONFIG: CashbackConfig = {
  enabled: true,
  mode: 'percent',
  value: 5,
  base: 'paid',
  releaseDays: 30,
  validityMonths: 12,
  maxRedemptionPct: 50,
};

/**
 * A09 — o que ainda não deixava rastro depois da revisão de segurança.
 *
 * O relatório pedia trilha em "cashback inteiro e moderação". Olhando de perto, quase
 * tudo já tinha registro **melhor** que uma linha de auditoria: o ledger de cashback é
 * append-only e grava `createdBy` em cada lançamento, e `resolveReport` já grava quem
 * decidiu na própria denúncia. Duplicar isso na trilha seria escrituração em dobro, e
 * trilha com ruído não é lida.
 *
 * Sobraram dois, e os dois pelo mesmo motivo: são **sobrescritas**. A config de cashback
 * troca a regra de todo mundo em uma linha só, e a moderação troca o status de um post
 * guardando o motivo mas não quem decidiu.
 */
describe('A09: trilha nas duas operações que sobrescrevem sem registro', () => {
  describe('CB-01: mudar a regra de cashback', () => {
    it('grava quem mudou e só os campos que mudaram', async () => {
      const cashback = fakeCashbackRepository();
      const audit = fakeAuditLogRepository();
      await cashback.saveConfig('tenant-a', CONFIG);

      await updateCashbackConfig({ cashback, audit }, admin, { ...CONFIG, value: 50 });

      const linhas = await audit.listByEntity('tenant-a', 'cashback_config', 'tenant-a');
      expect(linhas).toHaveLength(1);
      expect(linhas[0]).toMatchObject({
        actorUserId: 'u-admin',
        action: 'cashback_config.update',
        diff: { value: { from: 5, to: 50 } },
      });
    });

    it('desligar o cashback é a mudança que mais importa registrar', async () => {
      const cashback = fakeCashbackRepository();
      const audit = fakeAuditLogRepository();
      await cashback.saveConfig('tenant-a', CONFIG);

      await updateCashbackConfig({ cashback, audit }, admin, { ...CONFIG, enabled: false });

      const linhas = await audit.listByEntity('tenant-a', 'cashback_config', 'tenant-a');
      expect(linhas[0]!.diff).toEqual({ enabled: { from: true, to: false } });
    });

    it('salvar a mesma config não gera linha', async () => {
      const cashback = fakeCashbackRepository();
      const audit = fakeAuditLogRepository();
      await cashback.saveConfig('tenant-a', CONFIG);

      await updateCashbackConfig({ cashback, audit }, admin, { ...CONFIG });

      expect(await audit.listByEntity('tenant-a', 'cashback_config', 'tenant-a')).toHaveLength(0);
    });
  });

  describe('CO-08: moderar post', () => {
    it('tirar do ar grava quem decidiu, a ação e o motivo', async () => {
      const community = fakeCommunityRepository();
      const audit = fakeAuditLogRepository();

      await moderatePost({ community, audit }, admin, {
        postId: 'post-1',
        action: 'remove',
        reason: 'discurso de ódio',
      });

      const linhas = await audit.listByEntity('tenant-a', 'community_post', 'post-1');
      expect(linhas).toHaveLength(1);
      expect(linhas[0]).toMatchObject({
        actorUserId: 'u-admin',
        action: 'community_post.moderate',
        diff: { action: 'remove', status: 'removed', reason: 'discurso de ódio' },
      });
    });

    it('restaurar também é decisão de moderação, e também fica registrada', async () => {
      const community = fakeCommunityRepository();
      const audit = fakeAuditLogRepository();

      await moderatePost({ community, audit }, admin, {
        postId: 'post-1',
        action: 'restore',
        reason: '',
      });

      const linhas = await audit.listByEntity('tenant-a', 'community_post', 'post-1');
      expect(linhas[0]!.diff).toMatchObject({ action: 'restore', status: 'published' });
    });

    it('moderação recusada por falta de motivo não gera linha — nada aconteceu', async () => {
      const community = fakeCommunityRepository();
      const audit = fakeAuditLogRepository();

      await expect(
        moderatePost({ community, audit }, admin, { postId: 'post-1', action: 'hide', reason: '' }),
      ).rejects.toMatchObject({ code: 'reason_required' });

      expect(await audit.listByEntity('tenant-a', 'community_post', 'post-1')).toHaveLength(0);
    });
  });
});
