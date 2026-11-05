import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeAccess, EMPTY_USAGE, type Access, type GlobalBudget, type Usage, type UserLimit } from "@/lib/access";
import type { UsageReport } from "@/lib/ai";
import { costRecord, pickPrice, type ModelPrice } from "@/lib/pricing";
import { getOpenAiKey } from "@/lib/secrets";
import { DEFAULT_SETTINGS, mergeSettings, parseSetting, type PublicSettings, type Settings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";

// Leituras de servidor usadas pelo workspace e pelas rotas de IA.

/** Todas as configurações (service role). null quando a service role não está disponível. */
export async function loadAllSettings(): Promise<Settings | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.from("admin_settings").select("key,value");
  if (error) return null;
  return mergeSettings(data);
}

/** Configurações liberadas ao workspace (preço, teste e módulos) pela função get_public_settings. */
export async function loadPublicSettings(supabase: SupabaseClient): Promise<PublicSettings> {
  const { data } = await supabase.rpc("get_public_settings");
  const merged = mergeSettings(
    data
      ? [
          { key: "features", value: data.features },
          { key: "trial", value: data.trial },
          { key: "plan", value: data.plan ? { ...DEFAULT_SETTINGS.plan, ...data.plan } : null },
        ]
      : [],
  );
  return {
    features: merged.features,
    trial: merged.trial,
    plan: { price_brl: merged.plan.price_brl, available: merged.plan.available, renewal: merged.plan.renewal },
  };
}

export async function loadAccess(supabase: SupabaseClient, userId: string): Promise<Access> {
  const [{ data: subscription }, { data: activation, error }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("status")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ status: string }>(),
    supabase.rpc("activate_trial"),
  ]);
  if (subscription?.status === "authorized") {
    return { kind: "subscription", trialEndsAt: new Date(0) };
  }
  const trial = Array.isArray(activation) ? activation[0] : activation;
  if (error || !trial?.trial_started_at || typeof trial.trial_duration_hours !== "number") {
    return { kind: "expired", trialEndsAt: new Date(0) };
  }
  return computeAccess({
    profileCreatedAt: trial.trial_started_at,
    trialDays: trial.trial_duration_hours / 24,
    subscriptionStatus: subscription?.status,
  });
}

export async function loadUsage(supabase: SupabaseClient, userId: string): Promise<Usage> {
  const { data, error } = await supabase
    .from("usage_events")
    .select("feature,input_tokens,output_tokens,cost_brl,created_at")
    .eq("user_id", userId)
    .eq("status", "ok");
  if (error || !data) return EMPTY_USAGE;
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const usage = { ...EMPTY_USAGE };
  for (const e of data as { feature: string; input_tokens: number; output_tokens: number; cost_brl: number | string | null; created_at: string }[]) {
    const tokens = e.input_tokens + e.output_tokens;
    const t = new Date(e.created_at).getTime();
    usage.tokensTotal += tokens;
    usage.aiRequestsTotal += 1;
    if (t >= monthStart) {
      usage.tokensMonth += tokens;
      usage.costMonthBrl += Number(e.cost_brl ?? 0);
    }
    if (t >= dayStart) usage.tokensToday += tokens;
    if (e.feature === "petition_generate") usage.petitionsGenerated += 1;
    if (e.feature === "document_analysis") usage.documentsAnalyzed += 1;
  }
  return usage;
}

/** Limite individual de IA do usuário (service role; null = segue o limite geral). */
export async function loadUserLimit(userId: string): Promise<UserLimit | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("user_limits").select("tokens_month,cost_month_brl").eq("user_id", userId).maybeSingle();
  if (!data) return null;
  return { tokens_month: data.tokens_month ?? null, cost_month_brl: data.cost_month_brl == null ? null : Number(data.cost_month_brl) };
}

/** Gasto da plataforma no mês e o teto configurado. Sem service role, retorna null (o teto não é avaliado). */
export async function loadGlobalBudget(settings: Settings): Promise<GlobalBudget | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const capBrl = settings.ai_limits.cost_month_brl;
  if (capBrl == null) return { capBrl: null, spentBrl: 0 };
  const { data, error } = await admin.rpc("ai_cost_month_brl");
  // Se não for possível medir o gasto, bloqueia por segurança: o teto existe e não pode ser confirmado.
  if (error) return { capBrl, spentBrl: Number.POSITIVE_INFINITY };
  return { capBrl, spentBrl: Number(data ?? 0) };
}

/** Limite individual e teto global de uma vez, para as rotas de IA. */
export async function loadAiGuards(userId: string, settings: Settings) {
  const [userLimit, globalBudget] = await Promise.all([loadUserLimit(userId), loadGlobalBudget(settings)]);
  return { userLimit, globalBudget };
}

/**
 * Registra uma chamada bem-sucedida com o uso real retornado pela OpenAI e o custo pela tabela de preços vigente.
 * Não grava conteúdo de mensagens, petições ou documentos: apenas metadados de consumo.
 */
export async function recordUsage(event: { user_id: string; feature: string; result: UsageReport }) {
  const admin = createAdminClient();
  if (!admin) return;
  const { result } = event;
  const [{ data: prices }, { data: finance }] = await Promise.all([
    admin.from("ai_model_prices").select("*").lte("effective_from", new Date().toISOString()),
    admin.from("admin_settings").select("value").eq("key", "finance").maybeSingle<{ value: unknown }>(),
  ]);
  const usdBrl = parseSetting("finance", finance?.value).data?.usd_brl ?? null;
  const usage = {
    inputTokens: result.inputTokens,
    cachedInputTokens: result.cachedInputTokens,
    outputTokens: result.outputTokens,
    toolCalls: result.toolCalls,
  };
  const cost = costRecord(usage, pickPrice(normalizePrices(prices), result.model), usdBrl);
  await admin.from("usage_events").insert({
    user_id: event.user_id,
    feature: event.feature,
    model: result.model,
    request_id: result.requestId,
    input_tokens: result.inputTokens,
    cached_input_tokens: result.cachedInputTokens,
    output_tokens: result.outputTokens,
    reasoning_tokens: result.reasoningTokens,
    tool_calls: result.toolCalls,
    status: "ok",
    ...cost,
  });
}

/** Registra uma chamada que falhou (sem tokens cobrados), para acompanhamento. Não conta na cota. */
export async function recordAiFailure(event: { user_id: string; feature: string; model: string; code: string }) {
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("usage_events").insert({
    user_id: event.user_id,
    feature: event.feature,
    model: event.model || null,
    status: "error",
    error_code: event.code,
    cost_usd: 0,
  });
}

function normalizePrices(rows: Record<string, unknown>[] | null): ModelPrice[] {
  return (rows ?? []).map((r) => ({
    id: String(r.id),
    model: String(r.model),
    input_per_mtok_usd: Number(r.input_per_mtok_usd),
    cached_input_per_mtok_usd: r.cached_input_per_mtok_usd == null ? null : Number(r.cached_input_per_mtok_usd),
    output_per_mtok_usd: Number(r.output_per_mtok_usd),
    tool_prices_per_1k_usd: (r.tool_prices_per_1k_usd as Record<string, number>) ?? {},
    effective_from: String(r.effective_from),
  }));
}

/** IA pronta = chave da OpenAI no servidor + modelo autorizado pelo admin. Não expõe nenhum valor. */
export async function isAiReady(): Promise<boolean> {
  if (!(await getOpenAiKey())) return false;
  const settings = await loadAllSettings();
  return !!settings?.ai_model.model;
}

export async function activePrompt(): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("ai_prompts")
    .select("content")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ content: string }>();
  return data?.content ?? null;
}
