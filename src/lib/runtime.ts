import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeAccess, EMPTY_USAGE, type Access, type Usage } from "@/lib/access";
import { openAiKey } from "@/lib/env";
import { DEFAULT_SETTINGS, mergeSettings, type PublicSettings, type Settings } from "@/lib/settings";
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
    .select("feature,input_tokens,output_tokens,created_at")
    .eq("user_id", userId);
  if (error || !data) return EMPTY_USAGE;
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const usage = { ...EMPTY_USAGE };
  for (const e of data as { feature: string; input_tokens: number; output_tokens: number; created_at: string }[]) {
    const tokens = e.input_tokens + e.output_tokens;
    const t = new Date(e.created_at).getTime();
    usage.tokensTotal += tokens;
    usage.aiRequestsTotal += 1;
    if (t >= monthStart) usage.tokensMonth += tokens;
    if (t >= dayStart) usage.tokensToday += tokens;
    if (e.feature === "petition_generate") usage.petitionsGenerated += 1;
    if (e.feature === "document_analysis") usage.documentsAnalyzed += 1;
  }
  return usage;
}

export async function recordUsage(event: {
  user_id: string;
  feature: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
}) {
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("usage_events").insert(event);
}

/** IA pronta = chave da OpenAI no servidor + modelo autorizado pelo admin. Não expõe nenhum valor. */
export async function isAiReady(): Promise<boolean> {
  if (!openAiKey()) return false;
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
