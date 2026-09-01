import type { AllocationRepositories, UnitOfWork } from '@expedition/application';
import type { PrismaClient } from './client.js';
import { prismaCustomerRepository } from '../customers/prismaCustomerRepository.js';
import { prismaBookingRepository } from '../bookings/prismaBookingRepository.js';
import { prismaScheduleRepository } from '../schedule/prismaScheduleRepository.js';
import { prismaItineraryRepository } from '../itineraries/prismaItineraryRepository.js';
import { prismaCashbackRepository } from '../cashback/prismaCashbackRepository.js';
import { prismaIntakeRepository } from '../intake/prismaIntakeRepository.js';
import { prismaLegalDocumentRepository } from '../documents/prismaLegalDocumentRepository.js';
import { prismaIdentityChangeRepository } from '../identity/prismaIdentityChangeRepository.js';

/**
 * Implementação Prisma do UnitOfWork (§5.7.2). Abre UMA transação interativa e monta
 * os repositórios da alocação sobre o client de transação (`tx`) — todos escrevem na
 * mesma transação, então criar/reaproveitar cliente, criar o booking, marcar o intake
 * e gravar o aceite falham ou vencem juntos. Sem cliente órfão, sem inscrição sem aceite.
 *
 * O escopo de tenant continua garantido: os repositórios chamam `tenantClient(tx, …)`,
 * que sobre uma `tx` (sem `$extends`) devolve o proxy transacional — mesma injeção de
 * `tenantId`, sem escapar da transação.
 */
export function prismaUnitOfWork(base: PrismaClient): UnitOfWork {
  return {
    run: (_ctx, work) =>
      base.$transaction((tx) => {
        const client = tx as unknown as PrismaClient;
        const repos: AllocationRepositories = {
          customers: prismaCustomerRepository(client),
          bookings: prismaBookingRepository(client),
          schedule: prismaScheduleRepository(client),
          itineraries: prismaItineraryRepository(client),
          cashback: prismaCashbackRepository(client),
          intake: prismaIntakeRepository(client),
          documents: prismaLegalDocumentRepository(client),
          identityRequests: prismaIdentityChangeRepository(client),
        };
        return work(repos);
      }),
  };
}
