import { describe, expect, it } from "vitest";
import { aggregateUsage, type UsageEventRow } from "@/lib/usage-report";

const ev = (over: Partial<UsageEventRow>): UsageEventRow => ({
  user_id: "u1", feature: "assistant", model: "gpt-x", input_tokens: 100, output_tokens: 50,
  cost_brl: 1, cost_usd: 0.2, status: "ok", created_at: "2026-11-04T15:00:00Z", ...over,
});

describe("aggregateUsage", () => {
  const now = new Date("2026-11-04T20:00:00Z");
  it("soma totais, separa erros e não precificados", () => {
    const r = aggregateUsage([ev({}), ev({ user_id: "u2", cost_brl: null, cost_usd: null }), ev({ status: "error" })], { days: 7, now });
    expect(r.totals).toMatchObject({ requests: 2, errors: 1, tokens: 300, costBrl: 1, unpriced: 1 });
  });
  it("agrupa por usuário, funcionalidade e modelo, do maior gasto ao menor", () => {
    const r = aggregateUsage([ev({ user_id: "u1", cost_brl: 1 }), ev({ user_id: "u2", cost_brl: 5, feature: "petition_generate", model: "gpt-y" })], { days: 7, now });
    expect(r.byUser.map((b) => b.key)).toEqual(["u2", "u1"]);
    expect(r.byFeature[0].key).toBe("petition_generate");
    expect(r.byModel[0].key).toBe("gpt-y");
  });
  it("gera um ponto por dia e ignora eventos fora do período", () => {
    const r = aggregateUsage([ev({}), ev({ created_at: "2026-10-01T12:00:00Z" })], { days: 7, now });
    expect(r.daily).toHaveLength(7);
    expect(r.daily.at(-1)?.key).toBe("2026-11-04");
    expect(r.totals.requests).toBe(1);
  });
  it("usa o fuso de São Paulo para o dia", () => {
    // 02:00 UTC de 05/11 ainda é 04/11 em São Paulo.
    const r = aggregateUsage([ev({ created_at: "2026-11-05T02:00:00Z" })], { days: 3, now: new Date("2026-11-05T02:30:00Z") });
    expect(r.daily.at(-1)?.key).toBe("2026-11-04");
    expect(r.daily.at(-1)?.requests).toBe(1);
  });
});
