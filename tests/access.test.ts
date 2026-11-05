import { describe, expect, it } from "vitest";
import { checkAiAllowed, computeAccess, EMPTY_USAGE } from "@/lib/access";
import { DEFAULT_SETTINGS } from "@/lib/settings";

const created = "2026-10-01T00:00:00Z";
const s = { ...DEFAULT_SETTINGS };

describe("computeAccess", () => {
  it("expira o teste exatamente após as 72 horas ativadas", () => {
    expect(computeAccess({ profileCreatedAt: created, trialDays: 3, subscriptionStatus: null, now: new Date("2026-10-03T23:59:59.999Z") }).kind).toBe("trial");
    expect(computeAccess({ profileCreatedAt: created, trialDays: 3, subscriptionStatus: null, now: new Date("2026-10-04T00:00:00.000Z") }).kind).toBe("expired");
    expect(computeAccess({ profileCreatedAt: created, trialDays: 3, subscriptionStatus: "authorized", now: new Date("2026-12-01") }).kind).toBe("subscription");
    expect(computeAccess({ profileCreatedAt: created, trialDays: 3, subscriptionStatus: "pending", now: new Date("2026-12-01") }).kind).toBe("expired");
  });
});

describe("checkAiAllowed", () => {
  const trial = { kind: "trial" as const, trialEndsAt: new Date() };
  it("libera quando dentro dos limites", () => {
    expect(checkAiAllowed({ feature: "assistant", settings: s, access: trial, usage: EMPTY_USAGE })).toBeNull();
  });
  it("bloqueia teste expirado e módulo desativado", () => {
    expect(checkAiAllowed({ feature: "assistant", settings: s, access: { ...trial, kind: "expired" }, usage: EMPTY_USAGE })).toMatch(/terminou/);
    expect(checkAiAllowed({ feature: "assistant", settings: { ...s, features: { ...s.features, assistant: false } }, access: trial, usage: EMPTY_USAGE })).toMatch(/desativado/);
  });
  it("aplica limites diário e do teste", () => {
    const lim = { ...s, ai_limits: { ...s.ai_limits, tokens_user_day: 100 } };
    expect(checkAiAllowed({ feature: "assistant", settings: lim, access: trial, usage: { ...EMPTY_USAGE, tokensToday: 100 } })).toMatch(/diário/);
    const tr = { ...s, trial: { ...s.trial, ai_requests: 3 } };
    expect(checkAiAllowed({ feature: "assistant", settings: tr, access: trial, usage: { ...EMPTY_USAGE, aiRequestsTotal: 3 } })).toMatch(/teste gratuito/);
  });
});

describe("limites do administrador", () => {
  const trial = { kind: "trial" as const, trialEndsAt: new Date() };
  it("teto global pausa a IA para todos", () => {
    const r = checkAiAllowed({ feature: "assistant", settings: s, access: trial, usage: EMPTY_USAGE, globalBudget: { capBrl: 100, spentBrl: 100 } });
    expect(r).toMatch(/plataforma/);
    expect(checkAiAllowed({ feature: "assistant", settings: s, access: trial, usage: EMPTY_USAGE, globalBudget: { capBrl: 100, spentBrl: 99.9 } })).toBeNull();
    expect(checkAiAllowed({ feature: "assistant", settings: s, access: trial, usage: EMPTY_USAGE, globalBudget: { capBrl: null, spentBrl: 999 } })).toBeNull();
  });
  it("limite individual sobrepõe o limite mensal geral", () => {
    const geral = { ...s, ai_limits: { ...s.ai_limits, tokens_user_month: 1000 } };
    const usage = { ...EMPTY_USAGE, tokensMonth: 1500 };
    expect(checkAiAllowed({ feature: "assistant", settings: geral, access: trial, usage })).toMatch(/mensal/);
    expect(checkAiAllowed({ feature: "assistant", settings: geral, access: trial, usage, userLimit: { tokens_month: 5000, cost_month_brl: null } })).toBeNull();
    expect(checkAiAllowed({ feature: "assistant", settings: s, access: trial, usage, userLimit: { tokens_month: 1200, cost_month_brl: null } })).toMatch(/mensal/);
  });
  it("limite individual de gasto em reais", () => {
    const usage = { ...EMPTY_USAGE, costMonthBrl: 50 };
    expect(checkAiAllowed({ feature: "assistant", settings: s, access: trial, usage, userLimit: { tokens_month: null, cost_month_brl: 50 } })).toMatch(/gasto/);
    expect(checkAiAllowed({ feature: "assistant", settings: s, access: trial, usage, userLimit: { tokens_month: null, cost_month_brl: 80 } })).toBeNull();
  });
});
