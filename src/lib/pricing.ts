// Cálculo de custo das chamadas de IA a partir do uso real retornado pela API. Sem I/O, para poderem ser testadas.

export type ModelPrice = {
  id: string;
  model: string;
  input_per_mtok_usd: number;
  cached_input_per_mtok_usd: number | null;
  output_per_mtok_usd: number;
  tool_prices_per_1k_usd: Record<string, number>;
  effective_from: string;
};

export type AiUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  toolCalls: Record<string, number>;
};

/**
 * Preço vigente para o modelo na data: o prefixo mais longo que casa com o nome retornado pela API
 * (ex.: "gpt-5-mini" para "gpt-5-mini-2025-08-07") e, entre as vigências desse prefixo, a mais recente até `at`.
 */
export function pickPrice(prices: ModelPrice[], model: string, at: Date = new Date()): ModelPrice | null {
  const candidates = prices.filter((p) => model.startsWith(p.model) && new Date(p.effective_from) <= at);
  if (!candidates.length) return null;
  const longest = Math.max(...candidates.map((p) => p.model.length));
  return candidates
    .filter((p) => p.model.length === longest)
    .sort((a, b) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime())[0];
}

/** Custo em dólares. Tokens em cache saem do total de entrada e usam o preço de cache (ou o normal, se não houver). */
export function computeCostUsd(usage: AiUsage, price: ModelPrice): number {
  const cached = Math.min(usage.cachedInputTokens, usage.inputTokens);
  const uncached = usage.inputTokens - cached;
  const cachedRate = price.cached_input_per_mtok_usd ?? price.input_per_mtok_usd;
  let cost =
    (uncached * price.input_per_mtok_usd + cached * cachedRate + usage.outputTokens * price.output_per_mtok_usd) /
    1_000_000;
  for (const [tool, count] of Object.entries(usage.toolCalls)) {
    const per1k = price.tool_prices_per_1k_usd[tool];
    if (per1k) cost += (count * per1k) / 1000;
  }
  return Math.round(cost * 1e8) / 1e8;
}

export type CostRecord = { price_id: string | null; cost_usd: number | null; usd_brl_rate: number | null; cost_brl: number | null };

/** Custo completo de um evento. Sem preço cadastrado, o custo fica nulo (não precificado), nunca estimado por chute. */
export function costRecord(usage: AiUsage, price: ModelPrice | null, usdBrl: number | null): CostRecord {
  if (!price) return { price_id: null, cost_usd: null, usd_brl_rate: usdBrl, cost_brl: null };
  const costUsd = computeCostUsd(usage, price);
  return {
    price_id: price.id,
    cost_usd: costUsd,
    usd_brl_rate: usdBrl,
    cost_brl: usdBrl ? Math.round(costUsd * usdBrl * 1e6) / 1e6 : null,
  };
}
