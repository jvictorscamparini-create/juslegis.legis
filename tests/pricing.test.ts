import { describe, expect, it } from "vitest";
import { computeCostUsd, costRecord, pickPrice, type ModelPrice } from "@/lib/pricing";

// Preços fictícios, apenas para validar a fórmula.
const price = (over: Partial<ModelPrice> = {}): ModelPrice => ({
  id: "p1",
  model: "gpt-x",
  input_per_mtok_usd: 1,
  cached_input_per_mtok_usd: 0.1,
  output_per_mtok_usd: 4,
  tool_prices_per_1k_usd: { web_search_call: 10 },
  effective_from: "2026-01-01T00:00:00Z",
  ...over,
});

const usage = { inputTokens: 1_000_000, cachedInputTokens: 400_000, outputTokens: 250_000, toolCalls: {} };

describe("custo das chamadas de IA", () => {
  it("separa tokens em cache do restante da entrada", () => {
    // 600k × $1 + 400k × $0,10 + 250k × $4 = 0,60 + 0,04 + 1,00
    expect(computeCostUsd(usage, price())).toBeCloseTo(1.64, 8);
  });

  it("usa o preço normal de entrada quando não há preço de cache", () => {
    expect(computeCostUsd(usage, price({ cached_input_per_mtok_usd: null }))).toBeCloseTo(2.0, 8);
  });

  it("soma o custo das ferramentas por 1.000 chamadas", () => {
    expect(computeCostUsd({ ...usage, toolCalls: { web_search_call: 3, outra_call: 5 } }, price())).toBeCloseTo(1.67, 8);
  });

  it("nunca conta mais tokens em cache do que a entrada total", () => {
    expect(computeCostUsd({ inputTokens: 100, cachedInputTokens: 500, outputTokens: 0, toolCalls: {} }, price())).toBeCloseTo(0.00001, 10);
  });

  it("escolhe o prefixo mais longo e a vigência mais recente até a data", () => {
    const prices = [
      price({ id: "geral", model: "gpt-x" }),
      price({ id: "mini-antigo", model: "gpt-x-mini", effective_from: "2026-01-01T00:00:00Z" }),
      price({ id: "mini-novo", model: "gpt-x-mini", effective_from: "2026-06-01T00:00:00Z" }),
      price({ id: "futuro", model: "gpt-x-mini", effective_from: "2027-01-01T00:00:00Z" }),
    ];
    const at = new Date("2026-11-03T00:00:00Z");
    expect(pickPrice(prices, "gpt-x-mini-2026-05-01", at)?.id).toBe("mini-novo");
    expect(pickPrice(prices, "gpt-x-2026-05-01", at)?.id).toBe("geral");
    expect(pickPrice(prices, "outro-modelo", at)).toBeNull();
  });

  it("sem preço cadastrado, o custo fica nulo (não precificado), não estimado", () => {
    expect(costRecord(usage, null, 5.5)).toEqual({ price_id: null, cost_usd: null, usd_brl_rate: 5.5, cost_brl: null });
  });

  it("converte para reais pelo câmbio do administrador", () => {
    expect(costRecord(usage, price(), 5.5)).toEqual({ price_id: "p1", cost_usd: 1.64, usd_brl_rate: 5.5, cost_brl: 9.02 });
    expect(costRecord(usage, price(), null).cost_brl).toBeNull();
  });
});
