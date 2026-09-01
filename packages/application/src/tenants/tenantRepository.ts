import type { Cpf, LocalDate } from '@expedition/domain';

/**
 * Port do tenant (a empresa). Guarda duas coisas de assuntos diferentes, que moram na
 * mesma linha: a **identidade** (razão social, CNPJ, logo — CF-01) e o **condutor**
 * (CF-05), que é quem abre os documentos da saída.
 */

export interface CompanyInfo {
  readonly name: string;
  readonly cnpj: string | null;
  /**
   * GR-15: identifica a empresa por nome estável, não por id gerado. É o que permite
   * a um caso de uso decidir algo específico de um tenant sem carregar id de banco no
   * código — e sem uma consulta a mais, porque a linha do tenant já é lida aqui.
   */
  readonly slug: string;
  /**
   * CF-01/CF-03: a logo como data URI (PNG ou JPEG), guardada com a configuração e não
   * em bucket — quem mais precisa dela é o gerador de PDF, que roda no servidor e não
   * fala com o Storage. `null` = a empresa não enviou logo.
   */
  readonly logo: string | null;
}

/**
 * CF-05 — o condutor da empresa: quem guia a expedição e viaja junto. Não é cliente
 * (não tem inscrição, não paga, não gera cashback), por isso vive na configuração do
 * tenant. É ele que abre a roomlist (GR-15) e o comboio (GR-17).
 */
export interface CrewLead {
  readonly fullName: string;
  readonly cpf: Cpf;
  readonly birthDate: LocalDate;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: CrewAddress;
  readonly vehicle: ConvoyVehicle | null;
  readonly companions: readonly CrewCompanion[];
}

export interface CrewCompanion {
  readonly fullName: string;
  readonly birthDate: LocalDate;
}

/** Espelha o endereço do cadastro de clientes; tudo opcional, CEP só com dígitos. */
export interface CrewAddress {
  readonly street: string | null;
  readonly number: string | null;
  readonly district: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly zip: string | null;
}

export interface ConvoyVehicle {
  readonly brand: string;
  readonly model: string;
  /** Normalizada (sem hífen, caixa alta), como o resto do sistema guarda placa. */
  readonly plate: string;
}

/** Campo ausente preserva o valor atual; `null` explícito limpa. */
export interface CompanyPatch {
  readonly name?: string;
  readonly cnpj?: string | null;
  readonly logo?: string | null;
}

export interface TenantRepository {
  /** Nome e CNPJ da empresa do tenant, para o snapshot do Termo. */
  getCompanyInfo(tenantId: string): Promise<CompanyInfo>;
  /**
   * PG-03: resolve o tenant pelo slug da URL. É leitura **pré-tenant** — acontece antes
   * de haver contexto, como a verificação da chave de API do webhook de inscrições.
   */
  findIdBySlug(slug: string): Promise<string | null>;
  /**
   * CF-01: grava a identidade da empresa. Nome e CNPJ são colunas do tenant; a logo vive
   * em `settings.branding` — e a escrita **preserva o resto de `settings`** (a config de
   * cashback mora no mesmo objeto).
   */
  saveCompany(tenantId: string, patch: CompanyPatch): Promise<CompanyInfo>;
  /** CF-05: o condutor da empresa. `null` = o tenant não declarou nenhum. */
  getCrewLead(tenantId: string): Promise<CrewLead | null>;
  saveCrewLead(tenantId: string, lead: CrewLead | null): Promise<CrewLead | null>;
}
