import { describe, expect, it } from 'vitest';
import { parseLocalDate } from '@expedition/domain';
import { fakeCouponRepository } from './couponRepository.fake.js';
import { fakeAuditLogRepository } from '../audit/auditLogRepository.fake.js';
import { createCoupon, type CreateCouponCommand } from './createCoupon.js';
import { updateCoupon } from './updateCoupon.js';
import { listCoupons } from './listCoupons.js';
import { deleteCoupon } from './deleteCoupon.js';
import { ForbiddenError, NotFoundError } from '../errors.js';
import type { RequestContext } from '../context.js';

/**
 * CP-01..CP-04 — gestão do cupom pela equipe. Criar desconto é decisão comercial:
 * owner ou admin. Ler a lista é de qualquer papel de equipe, porque operator precisa
 * saber que cupom existe para conferir o que o cliente apresenta.
 */

const ctx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u1', role: 'admin' },
};
const operatorCtx: RequestContext = {
  tenantId: 'tenant-a',
  actor: { kind: 'team', userId: 'u2', role: 'operator' },
};

function setup() {
  const coupons = fakeCouponRepository();
  const audit = fakeAuditLogRepository();
  return { coupons, audit, deps: { coupons, audit } };
}

function command(overrides: Partial<CreateCouponCommand> = {}): CreateCouponCommand {
  return { code: 'verao10', mode: 'percent', value: 10, ...overrides };
}

describe('CP-01: criar cupom', () => {
  it('normaliza o código e nasce ativo, sem restrição', async () => {
    const { deps } = setup();

    const coupon = await createCoupon(deps, ctx, command());

    expect(coupon.code).toBe('VERAO10');
    expect(coupon.active).toBe(true);
    expect(coupon.itineraryId).toBeNull();
    expect(coupon.maxUses).toBeNull();
  });

  it('recusa código já usado no tenant', async () => {
    const { deps } = setup();
    await createCoupon(deps, ctx, command());

    await expect(createCoupon(deps, ctx, command({ code: 'VERAO10' }))).rejects.toMatchObject({
      code: 'code_taken',
    });
  });

  it('recusa código fora do formato', async () => {
    const { deps } = setup();

    await expect(createCoupon(deps, ctx, command({ code: 'oi' }))).rejects.toMatchObject({
      code: 'invalid_code',
    });
  });

  it('recusa percentual fora de 1..100 e valor fixo zerado', async () => {
    const { deps } = setup();

    await expect(createCoupon(deps, ctx, command({ value: 0 }))).rejects.toMatchObject({
      code: 'invalid_value',
    });
    await expect(createCoupon(deps, ctx, command({ value: 101 }))).rejects.toMatchObject({
      code: 'invalid_value',
    });
    await expect(
      createCoupon(deps, ctx, command({ mode: 'fixed', value: 0 })),
    ).rejects.toMatchObject({ code: 'invalid_value' });
  });

  it('recusa janela invertida', async () => {
    const { deps } = setup();

    await expect(
      createCoupon(deps, ctx, command({ validFrom: '2026-09-10', validUntil: '2026-09-01' })),
    ).rejects.toMatchObject({ code: 'invalid_window' });
  });

  it('CP-02: recusa escopo de roteiro e de saída ao mesmo tempo', async () => {
    const { deps } = setup();

    await expect(
      createCoupon(deps, ctx, command({ itineraryId: 'itin-1', groupId: 'group-1' })),
    ).rejects.toMatchObject({ code: 'ambiguous_scope' });
  });

  it('CP-04: recusa limite de uso zerado ou negativo', async () => {
    const { deps } = setup();

    await expect(createCoupon(deps, ctx, command({ maxUses: 0 }))).rejects.toMatchObject({
      code: 'invalid_limit',
    });
    await expect(
      createCoupon(deps, ctx, command({ maxUsesPerCustomer: -1 })),
    ).rejects.toMatchObject({ code: 'invalid_limit' });
  });

  it('CP-06: operator não cria cupom, e a criação vai para a trilha', async () => {
    const { deps, audit } = setup();

    await expect(createCoupon(deps, operatorCtx, command())).rejects.toBeInstanceOf(ForbiddenError);

    const coupon = await createCoupon(deps, ctx, command());
    expect(audit.rows).toContainEqual(
      expect.objectContaining({ entity: 'coupon', entityId: coupon.id, action: 'coupon.create' }),
    );
  });
});

describe('CP-01: editar cupom', () => {
  it('ativa e desativa sem tocar no código', async () => {
    const { deps } = setup();
    const coupon = await createCoupon(deps, ctx, command());

    const updated = await updateCoupon(deps, ctx, { couponId: coupon.id, active: false });

    expect(updated.active).toBe(false);
    expect(updated.code).toBe('VERAO10');
  });

  it('valida os mesmos limites da criação', async () => {
    const { deps } = setup();
    const coupon = await createCoupon(deps, ctx, command());

    await expect(
      updateCoupon(deps, ctx, { couponId: coupon.id, value: 200 }),
    ).rejects.toMatchObject({ code: 'invalid_value' });
  });

  it('a trilha guarda o que mudou, de e para', async () => {
    const { deps, audit } = setup();
    const coupon = await createCoupon(deps, ctx, command());

    await updateCoupon(deps, ctx, { couponId: coupon.id, value: 15 });

    const entry = audit.rows.find((r) => r.action === 'coupon.update');
    expect(entry?.diff).toMatchObject({ value: { from: 10, to: 15 } });
  });

  it('sem mudança nenhuma, não escreve na trilha', async () => {
    const { deps, audit } = setup();
    const coupon = await createCoupon(deps, ctx, command());

    await updateCoupon(deps, ctx, { couponId: coupon.id, value: 10 });

    expect(audit.rows.some((r) => r.action === 'coupon.update')).toBe(false);
  });

  it('cupom inexistente responde não encontrado', async () => {
    const { deps } = setup();

    await expect(
      updateCoupon(deps, ctx, { couponId: 'coupon-999', active: false }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('CP-04: listar cupons com o uso contado', () => {
  it('devolve os cupons do tenant com usos ativos', async () => {
    const { deps, coupons } = setup();
    const coupon = await createCoupon(deps, ctx, command({ maxUses: 5 }));
    await coupons.redeem({
      tenantId: ctx.tenantId,
      couponId: coupon.id,
      bookingId: 'booking-1',
      customerId: 'cus-1',
      code: coupon.code,
      mode: 'percent',
      value: 10,
      discountCents: 20_000 as never,
      redeemedBy: 'u1',
    });

    const list = await listCoupons(deps, ctx);

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ code: 'VERAO10', uses: 1, maxUses: 5 });
  });

  it('operator lê a lista', async () => {
    const { deps } = setup();
    await createCoupon(deps, ctx, command());

    await expect(listCoupons(deps, operatorCtx)).resolves.toHaveLength(1);
  });

  it('cliente não lê a lista', async () => {
    const { deps } = setup();

    await expect(
      listCoupons(deps, {
        ...ctx,
        actor: { kind: 'customer', customerId: 'cus-1', userId: 'u9' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('CP-01: excluir cupom', () => {
  it('some da lista e vai para a trilha', async () => {
    const { deps, audit } = setup();
    const coupon = await createCoupon(deps, ctx, command());

    await deleteCoupon(deps, ctx, { couponId: coupon.id });

    await expect(listCoupons(deps, ctx)).resolves.toHaveLength(0);
    expect(audit.rows.some((r) => r.action === 'coupon.delete')).toBe(true);
  });

  it('operator não exclui', async () => {
    const { deps } = setup();
    const coupon = await createCoupon(deps, ctx, command());

    await expect(deleteCoupon(deps, operatorCtx, { couponId: coupon.id })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('o código liberado pode ser recriado', async () => {
    const { deps } = setup();
    const coupon = await createCoupon(deps, ctx, command());
    await deleteCoupon(deps, ctx, { couponId: coupon.id });

    await expect(createCoupon(deps, ctx, command())).resolves.toMatchObject({ code: 'VERAO10' });
  });
});

describe('CP-02/CP-03: escopo e nominal são guardados como vieram', () => {
  it('guarda roteiro, validade e limites declarados', async () => {
    const { deps } = setup();

    const coupon = await createCoupon(
      deps,
      ctx,
      command({
        code: 'COXILHA-20',
        mode: 'fixed',
        value: 200_00,
        itineraryId: 'itin-1',
        customerId: 'cus-1',
        validFrom: '2026-09-01',
        validUntil: '2026-09-30',
        maxUses: 10,
        maxUsesPerCustomer: 1,
        description: 'Campanha de setembro',
      }),
    );

    expect(coupon).toMatchObject({
      code: 'COXILHA-20',
      mode: 'fixed',
      value: 200_00,
      itineraryId: 'itin-1',
      customerId: 'cus-1',
      maxUses: 10,
      maxUsesPerCustomer: 1,
      description: 'Campanha de setembro',
    });
    expect(coupon.validFrom).toEqual(parseLocalDate('2026-09-01'));
    expect(coupon.validUntil).toEqual(parseLocalDate('2026-09-30'));
  });
});
