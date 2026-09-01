import type { RequestContext } from '../context.js';
import type { CustomerRepository } from '../customers/customerRepository.js';
import type { BookingRepository } from '../bookings/bookingRepository.js';
import type { ScheduleRepository } from '../schedule/scheduleRepository.js';
import type { ItineraryRepository } from '../itineraries/itineraryRepository.js';
import type { CashbackRepository } from '../cashback/cashbackRepository.js';
import type { IntakeRepository } from '../intake/intakeRepository.js';
import type { LegalDocumentRepository } from '../documents/legalDocumentRepository.js';
import type { IdentityChangeRepository } from '../identity/identityChangeRepository.js';

/**
 * Unidade de trabalho (UnitOfWork). Permite a um caso de uso rodar várias escritas numa
 * **transação única** — tudo ou nada. A alocação de uma inscrição (§5.7.2) cria/reaproveita
 * cliente, cria o booking, marca o intake e grava o aceite: sem transação, uma falha no meio
 * deixa cliente órfão ou inscrição sem aceite. Os repositórios entregues ao `work` operam
 * todos na mesma transação; se o `work` lançar, nada é gravado.
 */

export interface AllocationRepositories {
  readonly customers: CustomerRepository;
  readonly bookings: BookingRepository;
  readonly schedule: ScheduleRepository;
  readonly itineraries: ItineraryRepository;
  readonly cashback: CashbackRepository;
  readonly intake: IntakeRepository;
  readonly documents: LegalDocumentRepository;
  /** IN-04: fila de revisão para divergência de dados na alocação (sem sobrescrever). */
  readonly identityRequests: IdentityChangeRepository;
}

export interface UnitOfWork {
  run<T>(ctx: RequestContext, work: (repos: AllocationRepositories) => Promise<T>): Promise<T>;
}

/**
 * UoW sem transação real: executa o `work` com os repositórios dados, na hora. Para dev,
 * testes e o repositório in-memory (onde não há transação a coordenar). A atomicidade real
 * vem da implementação Prisma (`prismaUnitOfWork`).
 */
export function passthroughUnitOfWork(repos: AllocationRepositories): UnitOfWork {
  return {
    run: (_ctx, work) => work(repos),
  };
}
