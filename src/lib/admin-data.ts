import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceRoleKey, supabasePublicConfig } from "@/lib/env";
import { secretStatuses } from "@/lib/secrets";
import { mergeSettings, type Settings } from "@/lib/settings";
import type { CheckInfo } from "@/components/admin/kit";

export async function loadSettingsFor(supabase: SupabaseClient): Promise<Settings> {
  const { data } = await supabase.from("admin_settings").select("key,value");
  return mergeSettings(data);
}

/** Último resultado real de cada serviço (tabela integration_checks). */
export async function loadLastChecks(supabase: SupabaseClient): Promise<Record<string, CheckInfo>> {
  const { data } = await supabase.from("integration_checks").select("service,ok,detail,created_at").order("created_at", { ascending: false }).limit(60);
  const out: Record<string, CheckInfo> = {};
  for (const r of data ?? []) if (!out[r.service]) out[r.service] = { ok: r.ok, detail: r.detail, at: r.created_at };
  return out;
}

export const statusLabel = (c: CheckInfo | undefined, defined: boolean) => (c ? (c.ok ? "Conectada" : "Falhou no último teste") : defined ? "Credencial definida · não testada" : "Não configurada");

/** Quais credenciais existem (painel ou ambiente). Nunca devolve valores. */
export async function loadSecretsPresent() {
  const st = await secretStatuses();
  const has = (n: keyof typeof st) => st[n].source !== null;
  return {
    openai: has("OPENAI_API_KEY"),
    mpTest: has("MP_ACCESS_TOKEN_TEST"),
    mpProd: has("MP_ACCESS_TOKEN_PROD"),
    mpWebhook: has("MP_WEBHOOK_SECRET"),
    supabaseUrl: !!supabasePublicConfig(),
    serviceRole: !!serviceRoleKey(),
    legal: has("OPENAI_API_KEY"),
  };
}
