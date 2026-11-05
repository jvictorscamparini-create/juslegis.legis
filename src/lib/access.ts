import type { Settings } from "@/lib/settings";

// Regras puras de acesso (teste gratuito, assinatura e limites). Sem I/O, para poderem ser testadas.

export type AccessKind = "subscription" | "trial" | "expired";

export type Access = { kind: AccessKind; trialEndsAt: Date };

const DAY = 86_400_000;

export function computeAccess(params: {
  profileCreatedAt: string | Date;
  trialDays: number;
  subscriptionStatus: string | null | undefined;
  now?: Date;
}): Access {
  const now = params.now ?? new Date();
  const trialEndsAt = new Date(new Date(params.profileCreatedAt).getTime() + params.trialDays * DAY);
  if (params.subscriptionStatus === "authorized") return { kind: "subscription", trialEndsAt };
  if (now < trialEndsAt) return { kind: "trial", trialEndsAt };
  return { kind: "expired", trialEndsAt };
}

export type Usage = {
  tokensToday: number;
  tokensMonth: number;
  tokensTotal: number;
  aiRequestsTotal: number;
  petitionsGenerated: number;
  documentsAnalyzed: number;
  /** Custo em reais das chamadas do mês (eventos sem preço cadastrado contam como zero). */
  costMonthBrl: number;
};

export const EMPTY_USAGE: Usage = {
  tokensToday: 0,
  tokensMonth: 0,
  tokensTotal: 0,
  aiRequestsTotal: 0,
  petitionsGenerated: 0,
  documentsAnalyzed: 0,
  costMonthBrl: 0,
};

/** Limite individual definido pelo administrador; sobrepõe o limite mensal geral de tokens. */
export type UserLimit = { tokens_month: number | null; cost_month_brl: number | null };

/** Situação do teto global de gasto da plataforma no mês. */
export type GlobalBudget = { capBrl: number | null; spentBrl: number };

/** Percentual do teto já usado (null quando não há teto). */
export function budgetUsedPct(b: GlobalBudget): number | null {
  if (b.capBrl == null) return null;
  if (b.capBrl === 0) return 100;
  return Math.round((b.spentBrl / b.capBrl) * 1000) / 10;
}

export type AiFeature = "assistant" | "petitions";

/** Retorna o motivo do bloqueio, ou null se a operação de IA pode prosseguir. */
export function checkAiAllowed(params: {
  feature: AiFeature;
  settings: Pick<Settings, "features" | "ai_limits" | "trial" | "plan">;
  access: Access;
  usage: Usage;
  hasDocuments?: boolean;
  userLimit?: UserLimit | null;
  globalBudget?: GlobalBudget | null;
}): string | null {
  const { feature, settings, access, usage } = params;
  if (!settings.features[feature]) return "Este módulo está desativado pelo administrador.";
  const budget = params.globalBudget;
  if (budget && budget.capBrl != null && budget.spentBrl >= budget.capBrl) {
    return "O limite mensal de gasto com IA da plataforma foi atingido. A IA volta no próximo mês ou quando o administrador ajustar o limite.";
  }
  if (access.kind === "expired") return "Seu teste gratuito terminou. Assine o plano para continuar usando a IA.";
  if (access.kind === "subscription" && !settings.plan.features[feature]) return "Este módulo não está incluído no plano.";

  const limits = settings.ai_limits;
  const own = params.userLimit;
  if (own?.cost_month_brl != null && usage.costMonthBrl >= own.cost_month_brl) return "Seu limite mensal de gasto com IA foi atingido.";
  if (limits.tokens_user_day && usage.tokensToday >= limits.tokens_user_day) return "Limite diário de uso da IA atingido.";
  const monthTokens = own?.tokens_month ?? limits.tokens_user_month;
  if (monthTokens && usage.tokensMonth >= monthTokens) return "Limite mensal de uso da IA atingido.";
  if (access.kind === "subscription" && settings.plan.tokens_month && usage.tokensMonth >= settings.plan.tokens_month) {
    return "Limite mensal de tokens do plano atingido.";
  }

  if (access.kind === "trial") {
    const t = settings.trial;
    if (t.ai_requests && usage.aiRequestsTotal >= t.ai_requests) return "Limite de solicitações de IA do teste gratuito atingido.";
    if (t.max_tokens && usage.tokensTotal >= t.max_tokens) return "Limite de consumo do teste gratuito atingido.";
    if (feature === "petitions" && t.petitions && usage.petitionsGenerated >= t.petitions) {
      return "Limite de petições do teste gratuito atingido.";
    }
    if (params.hasDocuments && t.documents && usage.documentsAnalyzed >= t.documents) {
      return "Limite de análises documentais do teste gratuito atingido.";
    }
  }
  return null;
}
