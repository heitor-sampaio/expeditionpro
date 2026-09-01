import {
  ApplicationError,
  DuplicateCpfError,
  ForbiddenError,
  NotFoundError,
  RequiredFieldError,
  UnauthorizedError,
} from '@expedition/application';
import {
  IntakeValidationError,
  InvalidCnpjError,
  InvalidCompanyLogoError,
  InvalidCpfError,
  InvalidLocalDateError,
  InvalidPhoneError,
  InvalidPixKeyError,
  InvalidPlateError,
} from '@expedition/domain';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import type { FastifyInstance } from 'fastify';

/**
 * Mapeia erro para status, sem vazar estrutura interna (§11.7): só um `error` com
 * código estável, nunca stack, query ou nome de tabela. Erro de negócio é tipo,
 * então o mapeamento é por instância, não por string.
 */
export function installErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(400).send({ error: 'validation_failed' });
    }
    if (error instanceof InvalidCpfError) return reply.status(422).send({ error: 'invalid_cpf' });
    if (error instanceof InvalidCnpjError) return reply.status(422).send({ error: 'invalid_cnpj' });
    if (error instanceof InvalidCompanyLogoError) {
      return reply.status(422).send({ error: 'invalid_logo' });
    }
    if (error instanceof InvalidPlateError)
      return reply.status(422).send({ error: 'invalid_plate' });
    if (error instanceof InvalidLocalDateError) {
      return reply.status(422).send({ error: 'invalid_birth_date' });
    }
    if (error instanceof InvalidPixKeyError) {
      return reply.status(422).send({ error: 'invalid_pix_key' });
    }
    if (error instanceof InvalidPhoneError) {
      return reply.status(422).send({ error: 'invalid_phone' });
    }
    if (error instanceof IntakeValidationError) {
      return reply
        .status(422)
        .send({ error: 'validation_failed', fields: { [error.field]: error.code } });
    }
    if (error instanceof RequiredFieldError) {
      return reply.status(422).send({ error: error.code, field: error.field });
    }
    if (error instanceof DuplicateCpfError) return reply.status(409).send({ error: error.code });
    if (error instanceof UnauthorizedError) return reply.status(401).send({ error: error.code });
    if (error instanceof ForbiddenError) return reply.status(403).send({ error: error.code });
    if (error instanceof NotFoundError) return reply.status(404).send({ error: error.code });
    if (error instanceof ApplicationError) return reply.status(400).send({ error: error.code });

    // Erros HTTP do Fastify/plugins já trazem status (ex.: 429 do rate limit, SEC-14).
    // Repassa o 4xx com código estável em vez de mascarar como 500.
    const status = (error as { statusCode?: number }).statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return reply
        .status(status)
        .send({ error: status === 429 ? 'rate_limited' : 'request_error' });
    }

    request.log.error(error);
    return reply.status(500).send({ error: 'internal_error' });
  });
}
