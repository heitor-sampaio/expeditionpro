import { describe, expect, it, vi } from 'vitest';
import { notifyTeam } from './notifyTeam.js';
import { fakeMembershipRepository } from '../team/membershipRepository.fake.js';
import type { RequestContext } from '../context.js';

/**
 * AU-13 — avisar a equipe.
 *
 * O `NotificationGateway` só sabia falar com **cliente**, em dois assuntos fixos. Avisar a
 * equipe é outra audiência e outro texto: "a Ana perguntou preço às 23h e ninguém respondeu"
 * não é e-mail transacional de inscrição.
 *
 * O que se cobra aqui é quem recebe. Mandar para a lista errada é o erro caro: um aviso de
 * automação com nome de cliente indo para fora da equipe é vazamento, não incômodo.
 */

const ctx: RequestContext = {
  tenantId: 't1',
  actor: { kind: 'team', userId: 'u-ana', role: 'admin' },
};

function deps(membros: { userId: string; email: string | null; role: string }[]) {
  return {
    memberships: fakeMembershipRepository(
      membros.map((m) => ({
        tenantId: 't1',
        userId: m.userId,
        email: m.email,
        role: m.role as 'owner' | 'admin' | 'operator' | 'viewer',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      })),
    ),
    notifications: { sendTeamNotice: vi.fn().mockResolvedValue(undefined) },
  };
}

describe('AU-13: o aviso vai para a equipe', () => {
  it('manda para quem tem e-mail no tenant', async () => {
    const d = deps([
      { userId: 'u-ana', email: 'ana@drakkar.com.br', role: 'admin' },
      { userId: 'u-bia', email: 'bia@drakkar.com.br', role: 'operator' },
    ]);

    await notifyTeam(d, ctx, { text: 'Ana perguntou preço fora do horário.' });

    expect(d.notifications.sendTeamNotice).toHaveBeenCalledWith({
      to: ['ana@drakkar.com.br', 'bia@drakkar.com.br'],
      text: 'Ana perguntou preço fora do horário.',
    });
  });

  /** Membro sem e-mail não vira string vazia na lista de destinatários. */
  it('quem não tem e-mail fica de fora', async () => {
    const d = deps([
      { userId: 'u-ana', email: 'ana@drakkar.com.br', role: 'admin' },
      { userId: 'u-sem', email: null, role: 'operator' },
    ]);

    await notifyTeam(d, ctx, { text: 'oi' });

    expect(d.notifications.sendTeamNotice).toHaveBeenCalledWith({
      to: ['ana@drakkar.com.br'],
      text: 'oi',
    });
  });

  /** Sem ninguém para avisar, não se chama o provedor — não é erro, é uma equipe sem e-mail. */
  it('sem destinatário, não manda nada', async () => {
    const d = deps([{ userId: 'u-sem', email: null, role: 'owner' }]);

    await notifyTeam(d, ctx, { text: 'oi' });

    expect(d.notifications.sendTeamNotice).not.toHaveBeenCalled();
  });

  it('texto em branco é recusado — aviso vazio só gera ruído', async () => {
    const d = deps([{ userId: 'u-ana', email: 'ana@drakkar.com.br', role: 'admin' }]);

    await expect(notifyTeam(d, ctx, { text: '   ' })).rejects.toThrow();
    expect(d.notifications.sendTeamNotice).not.toHaveBeenCalled();
  });

  /** A equipe de um tenant não recebe aviso de outro. */
  it('não mistura tenant', async () => {
    const d = deps([{ userId: 'u-ana', email: 'ana@drakkar.com.br', role: 'admin' }]);

    await notifyTeam(d, { ...ctx, tenantId: 't2' }, { text: 'oi' });

    expect(d.notifications.sendTeamNotice).not.toHaveBeenCalled();
  });
});
