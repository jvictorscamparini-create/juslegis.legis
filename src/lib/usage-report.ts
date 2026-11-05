// Agregação dos eventos de uso para o painel de gastos do administrador. Função pura, testada em tests/usage-report.test.ts.

export type UsageEventRow = {
  user_id: string;
  feature: string;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_brl: number | string | null;
  cost_usd: number | string | null;
  status: "ok" | "error";
  created_at: string;
};

export type Bucket = { key: string; requests: number; errors: number; tokens: number; costBrl: number; costUsd: number; unpriced: number };

export type UsageReport = {
  totals: Bucket;
  /** Um ponto por dia do período (dias sem uso aparecem zerados), no fuso de São Paulo. */
  daily: Bucket[];
  byUser: Bucket[];
  byFeature: Bucket[];
  byModel: Bucket[];
};

const emptyBucket = (key: string): Bucket => ({ key, requests: 0, errors: 0, tokens: 0, costBrl: 0, costUsd: 0, unpriced: 0 });

function add(b: Bucket, e: UsageEventRow) {
  if (e.status === "error") {
    b.errors += 1;
    return;
  }
  b.requests += 1;
  b.tokens += (e.input_tokens ?? 0) + (e.output_tokens ?? 0);
  if (e.cost_brl == null && e.cost_usd == null) b.unpriced += 1;
  b.costBrl += Number(e.cost_brl ?? 0);
  b.costUsd += Number(e.cost_usd ?? 0);
}

/** Data AAAA-MM-DD no fuso de São Paulo. */
export function spDay(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export function aggregateUsage(events: UsageEventRow[], opts: { days: number; now?: Date }): UsageReport {
  const now = opts.now ?? new Date();
  const days: string[] = [];
  for (let i = opts.days - 1; i >= 0; i--) days.push(spDay(new Date(now.getTime() - i * 86_400_000)));
  const daily = new Map(days.map((d) => [d, emptyBucket(d)]));
  const byUser = new Map<string, Bucket>();
  const byFeature = new Map<string, Bucket>();
  const byModel = new Map<string, Bucket>();
  const totals = emptyBucket("total");

  const get = (m: Map<string, Bucket>, k: string) => m.get(k) ?? (m.set(k, emptyBucket(k)), m.get(k)!);

  for (const e of events) {
    const day = daily.get(spDay(e.created_at));
    if (!day) continue; // fora do período
    add(totals, e);
    add(day, e);
    add(get(byUser, e.user_id), e);
    add(get(byFeature, e.feature), e);
    add(get(byModel, e.model || "sem modelo"), e);
  }

  const sort = (m: Map<string, Bucket>) => [...m.values()].sort((a, b) => b.costBrl - a.costBrl || b.tokens - a.tokens || b.requests - a.requests);
  return { totals, daily: [...daily.values()], byUser: sort(byUser), byFeature: sort(byFeature), byModel: sort(byModel) };
}

export const FEATURE_NAMES: Record<string, string> = {
  assistant: "Assistente jurídico",
  document_analysis: "Análise de documento",
  petition_generate: "Geração de petição",
  petition_review: "Revisão de petição",
  petition_rewrite: "Reescrita de petição",
  legal_research: "Pesquisa em fontes oficiais",
};

export const featureName = (k: string) => FEATURE_NAMES[k] ?? k;

/** Início da consulta do período (com um dia de folga para cobrir a diferença de fuso). */
export function periodStartIso(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - (days + 1) * 86_400_000).toISOString();
}
