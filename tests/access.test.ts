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
