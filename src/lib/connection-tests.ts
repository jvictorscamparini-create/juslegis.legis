import "server-only";
import { legalDataKey, mpWebhookSecret, openAiKey, type MpEnvironment } from "@/lib/env";
import { mpRequest } from "@/lib/mercadopago";
import { createAdminClient } from "@/lib/supabase/admin";

// Testes de conexão reais: cada um chama o serviço de verdade e só reporta sucesso se ele responder.

export type CheckResult = { ok: boolean; detail: string };
export const SERVICES = ["openai", "mp_test", "mp_prod", "supabase", "legal"] as const;
export type Service = (typeof SERVICES)[number];

export function isService(s: string): s is Service {
  return (SERVICES as readonly string[]).includes(s);
}

export async function testOpenAI(configuredModel: string, fetchImpl: typeof fetch = fetch): Promise<CheckResult> {
  const key = openAiKey();
  if (!key) return { ok: false, detail: "OPENAI_API_KEY não definida no servidor." };
  try {
    const res = await fetchImpl("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401) return { ok: false, detail: "Credencial recusada pela OpenAI (401)." };
    if (!res.ok) return { ok: false, detail: `OpenAI respondeu HTTP ${res.status}.` };
    const data = (await res.json()) as { data?: { id: string }[] };
    const ids = (data.data ?? []).map((m) => m.id);
    if (configuredModel && !ids.includes(configuredModel)) {
      return { ok: false, detail: `Credencial válida, mas o modelo "${configuredModel}" não está disponível para ela.` };
    }
    return {
      ok: true,
      detail: configuredModel
        ? `Credencial válida. Modelo "${configuredModel}" disponível.`
        : `Credencial válida (${ids.length} modelos acessíveis). Nenhum modelo selecionado ainda.`,
    };
  } catch {
    return { ok: false, detail: "Não foi possível contatar a OpenAI." };
  }
}

export async function testMercadoPago(env: MpEnvironment, fetchImpl: typeof fetch = fetch): Promise<CheckResult> {
  const res = await mpRequest<{ id: number; nickname?: string; site_id?: string }>(env, "/users/me", {}, fetchImpl);
  if (!res.ok) {
    return { ok: false, detail: res.status ? `Mercado Pago respondeu HTTP ${res.status}: ${res.message}` : res.message };
  }
  const warn = mpWebhookSecret() ? "" : " Atenção: MP_WEBHOOK_SECRET não definido — webhooks serão rejeitados.";
  return { ok: true, detail: `Conta conectada (${res.data.nickname ?? res.data.id}, ${res.data.site_id ?? "?"}).${warn}` };
}

export async function testSupabase(): Promise<CheckResult> {
  const admin = createAdminClient();
  if (!admin) {
    return {
      ok: false,
      detail: "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY ou SUPABASE_SERVICE_ROLE_KEY não definidas.",
    };
  }
  const { error } = await admin.from("admin_settings").select("key", { count: "exact", head: true });
  if (error) return { ok: false, detail: `Schema não encontrado (${error.message}). Aplique a migração.` };
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (users.error) return { ok: false, detail: `Auth respondeu com erro: ${users.error.message}` };
  const { data: bucket } = await admin.storage.getBucket("user-files");
  if (!bucket) return { ok: false, detail: "Banco e Auth respondendo, mas o bucket privado user-files não existe." };
  return { ok: true, detail: "Banco, Auth e armazenamento privado respondendo." };
}

export async function testLegal(): Promise<CheckResult> {
  if (!legalDataKey()) return { ok: false, detail: "Nenhum fornecedor jurídico configurado." };
  return { ok: false, detail: "Credencial definida, mas nenhum fornecedor jurídico está integrado nesta versão." };
}

export async function runCheck(service: Service, configuredModel: string): Promise<CheckResult> {
  switch (service) {
    case "openai":
      return testOpenAI(configuredModel);
    case "mp_test":
      return testMercadoPago("test");
    case "mp_prod":
      return testMercadoPago("prod");
    case "supabase":
      return testSupabase();
    case "legal":
      return testLegal();
  }
}
