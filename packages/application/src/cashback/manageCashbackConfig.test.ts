import { describe, expect, it } from 'vitest';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import type { CashbackConfig } from '@expedition/domain';
import { fakeCashbackRepository } from './cashbackRepository.fake.js';
import { getCashbackConfig, updateCashbackConfig } from './manageCashbackConfig.js';
import { BusinessRuleError, ForbiddenError } from '../errors.js';
import type { RequestContext } from '../context.js';

function ctxWith(role: 'owner' | 'admin' | 'operator' | 'viewer'): RequestContext {
  return { tenantId: 'tenant-a', actor: { kind: 'team', userId: 'u1', role } };
}

const audit = fakeAuditLogRepository();
const VALID: CashbackConfig = {
  enabled: true,
  mode: 'percent',
  value: 5,
  base: 'paid',
  releaseDays: 30,
  validityMonths: 12,
  maxRedemptionPct: 50,
};

describe('CB-02: leitura da config de cashback', () => {
  it('retorna a config desligada por padrão (módulo nasce off)', async () => {
    const cashback = fakeCashbackRepository();
    const config = await getCashbackConfig({ cashback, audit }, ctxWith('admin'));
    expect(config.enabled).toBe(false);
    expect(config.value).toBe(0);
  });

  it('é da equipe: contexto de cliente é recusado', async () => {
    const cashback = fakeCashbackRepository();
    const customerCtx: RequestContext = {
      tenantId: 'tenant-a',
      actor: { kind: 'customer', customerId: 'c1', userId: 'u1' },
    };
    await expect(getCashbackConfig({ cashback, audit }, customerCtx)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe('CB-01/CB-02: atualização da config de cashback', () => {
  it('persiste a config e a leitura seguinte reflete', async () => {
    const cashback = fakeCashbackRepository();
    const saved = await updateCashbackConfig({ cashback, audit }, ctxWith('owner'), VALID);
    expect(saved.enabled).toBe(true);
    expect(saved.value).toBe(5);
    const read = await getCashbackConfig({ cashback, audit }, ctxWith('admin'));
    expect(read.mode).toBe('percent');
    expect(read.value).toBe(5);
    expect(read.maxRedemptionPct).toBe(50);
  });

  it('CB-01: percentual acima de 100 é recusado', async () => {
    const cashback = fakeCashbackRepository();
    await expect(
      updateCashbackConfig({ cashback, audit }, ctxWith('admin'), {
        ...VALID,
        mode: 'percent',
        value: 150,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('CB-01: valor fixo negativo é recusado', async () => {
    const cashback = fakeCashbackRepository();
    await expect(
      updateCashbackConfig({ cashback, audit }, ctxWith('admin'), {
        ...VALID,
        mode: 'fixed',
        value: -1,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('CB-06: teto de resgate fora de 0..100 é recusado', async () => {
    const cashback = fakeCashbackRepository();
    await expect(
      updateCashbackConfig({ cashback, audit }, ctxWith('admin'), {
        ...VALID,
        maxRedemptionPct: 120,
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('dias de liberação negativos são recusados', async () => {
    const cashback = fakeCashbackRepository();
    await expect(
      updateCashbackConfig({ cashback, audit }, ctxWith('admin'), { ...VALID, releaseDays: -5 }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('mexer em dinheiro da empresa exige owner ou admin: operator é recusado', async () => {
    const cashback = fakeCashbackRepository();
    await expect(
      updateCashbackConfig({ cashback, audit }, ctxWith('operator'), VALID),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
