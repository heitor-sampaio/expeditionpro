import { formatLocalDateISO, sumCents } from '@expedition/domain';
import { bookingContracted } from '../bookings/bookingTotals.js';
import type { RunContext } from '@expedition/domain';
import type { RequestContext } from '../context.js';
import type { BookingRepository } from '../bookings/bookingRepository.js';
import type { ScheduleRepository } from '../schedule/scheduleRepository.js';
import type { CustomerRepository } from '../customers/customerRepository.js';
import type { PaymentRepository } from '../payments/paymentRepository.js';
import type { ItineraryRepository } from '../itineraries/itineraryRepository.js';

/**
 * AU-16 — o que os gatilhos de inscrição põem no contexto.
 *
 * Os quatro gatilhos de inscrição entregavam **um id**, e um id não escreve "seu pagamento
 * entrou, Ana": não havia de onde tirar nome, valor nem saída, então automação nenhuma tinha
 * como falar com cliente. O que aqui se monta é exatamente o que `CAMPOS_DO_GATILHO` promete
 * na tela, e um teste da borda cobra os dois lados.
 *
 * **Sem CPF**, pela mesma razão do catálogo de busca (AU-20): o contexto vira texto de mensagem
 * e pode sair numa chamada de URL (AU-21), e documento de identidade não passeia por aí. Quem
 * precisa do CPF abre a ficha, onde a decisão de mostrar já foi tomada.
 *
 * **Sem guarda de audiência, de propósito.** Quem chega aqui é a borda que acabou de concluir a
 * operação — inclusive o webhook do gateway (PG-03), que age como `system` e não tem usuário
 * por trás. A audiência foi decidida na rota que causou o acontecimento; uma guarda aqui faria
 * o gatilho do pagamento pelo ASAAS morrer dentro de um `catch`, que é o pior lugar para
 * descobrir. Não acrescente `requireTeam` — o teste "o sistema monta o mesmo contexto" existe
 * para isso.
 *
 * **Um `bookingId`, nunca uma lista.** Caminho em lote (cancelar a saída inteira, AG-05) viraria
 * N × 3 leituras disparadas em paralelo, fora do controle da resposta HTTP e sem teto nenhum.
 * Quando existir, é outro desenho — não um laço em volta desta função.
 */

export interface BuildBookingContextDeps {
  readonly bookings: BookingRepository;
  readonly schedule: ScheduleRepository;
  readonly customers: CustomerRepository;
  readonly payments: PaymentRepository;
  readonly itineraries: ItineraryRepository;
}

export interface BuildBookingContextCommand {
  readonly bookingId: string;
}

export async function buildBookingContext(
  deps: BuildBookingContextDeps,
  ctx: RequestContext,
  command: BuildBookingContextCommand,
): Promise<RunContext> {
  const inscricao = await deps.bookings.findById(ctx.tenantId, command.bookingId);
  // Sem a inscrição não há o que montar: sobra o id, que é o contexto de antes desta fatia.
  if (!inscricao) return { inscricao: { id: command.bookingId } };

  // Uma ida por nível de chave estrangeira, e não uma por campo: o grupo, o responsável e os
  // recebimentos só dependem da inscrição, então vão juntos.
  const [saida, responsavel, recebimentos] = await Promise.all([
    deps.schedule.findGroupById(ctx.tenantId, inscricao.groupId),
    deps.customers.findById(ctx.tenantId, inscricao.responsibleCustomerId),
    deps.payments.listByBooking(ctx.tenantId, command.bookingId),
  ]);
  const roteiro = saida
    ? await deps.itineraries.findById(ctx.tenantId, saida.group.itineraryId)
    : null;

  /*
   * §3.6 — devolução e conversão em crédito entram **negativas** no ledger, e o repositório já
   * deixa de fora o recebimento excluído. A soma sai líquida sem filtrar espécie, que é a mesma
   * conta da mesa (GR-07) — e precisa ser: uma mensagem dizendo "faltam X" que discorde do
   * painel é pior que mensagem nenhuma.
   */
  const contratado = Number(bookingContracted(inscricao));
  const recebido = Number(sumCents(recebimentos.map((recebimento) => recebimento.amountCents)));

  return {
    contato: {
      nome: responsavel?.fullName ?? '',
      // Telefone em E.164 cru, como o resto do contexto de automação: é ele que a ação de
      // mensagem usa para achar o destinatário, e formatado não serviria para isso.
      telefone: responsavel?.phone ?? '',
      email: responsavel?.email ?? '',
    },
    inscricao: {
      id: inscricao.id,
      status: inscricao.status,
      pessoas: inscricao.participants.length,
      origem: inscricao.source,
      totalCents: contratado,
      recebidoCents: recebido,
      saldoCents: contratado - recebido,
    },
    saida: {
      nome: saida?.group.name ?? '',
      roteiro: roteiro?.name ?? '',
      inicio: saida ? formatLocalDateISO(saida.event.startDate) : '',
      fim: saida ? formatLocalDateISO(saida.event.endDate) : '',
    },
  };
}
