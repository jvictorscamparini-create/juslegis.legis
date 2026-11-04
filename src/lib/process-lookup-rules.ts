import type { Access } from "@/lib/access";
import type { Settings } from "@/lib/settings";

// Regras puras da consulta processual. Sem I/O, para poderem ser testadas.

const CNJ_FORMAT = /^(\d{7})-?(\d{2})\.?(\d{4})\.?(\d)\.?(\d{2})\.?(\d{4})$/;

/** Devolve o número no formato CNJ se os dígitos verificadores conferirem; senão, null. */
export function normalizeCnj(value: string): string | null {
  const match = CNJ_FORMAT.exec(value.trim());
  if (!match) return null;
  const [, sequence, check, year, segment, court, origin] = match;
  // Módulo 97 da Resolução CNJ 65/2008, em partes para não estourar a precisão do número.
  const mod = (digits: string, start: number) => Number(`${start}${digits}`) % 97;
  const remainder = mod(`${origin}00`, mod(`${year}${segment}${court}`, mod(sequence, 0)));
  if (98 - remainder !== Number(check)) return null;
  return `${sequence}-${check}.${year}.${segment}.${court}.${origin}`;
}

/** Motivo de a consulta estar bloqueada, ou null. Cada consulta é paga, por isso há freios próprios. */
export function processLookupBlocked(params: {
  settings: Pick<Settings, "features" | "legal" | "plan" | "process_lookup">;
  access: Access;
  usedToday: number | null;
}): string | null {
  const { settings, access, usedToday } = params;
  if (!settings.process_lookup.provider) return "A consulta processual ainda não foi ativada pelo administrador.";
  if (!settings.features.process_lookup || !settings.legal.sources.process_lookup) return "A consulta processual está desativada pelo administrador.";
  if (access.kind === "expired") return "Seu teste gratuito terminou. Assine o plano para continuar.";
  if (access.kind === "trial" && !settings.process_lookup.allow_trial) return "A consulta processual não está disponível no teste gratuito.";
  if (access.kind === "subscription" && !settings.plan.features.process_lookup) return "A consulta processual não está incluída no plano.";
  // Sem conseguir contar, não arrisca gastar: a consulta é cobrada pelo fornecedor.
  if (usedToday === null) return "Não foi possível verificar seu limite de consultas. Tente novamente.";
  if (usedToday >= settings.process_lookup.daily_limit_user) return "Limite diário de consultas processuais atingido.";
  return null;
}
