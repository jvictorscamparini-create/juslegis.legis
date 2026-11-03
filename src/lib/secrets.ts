import "server-only";
import { mpAccessToken as envMpToken, mpWebhookSecret as envMpWebhook, openAiKey as envOpenAiKey, type MpEnvironment } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret, parseMasterKey } from "@/lib/secret-crypto";

// Credenciais de integrações. Ordem de leitura: valor salvo no painel do Administrador Geral
// (cifrado em public.integration_secrets) e, se não houver, a variável de ambiente.
// Os valores nunca são devolvidos ao navegador: o painel só recebe "definida" e os 4 últimos caracteres.

export const SECRET_NAMES = ["OPENAI_API_KEY", "MP_ACCESS_TOKEN_TEST", "MP_ACCESS_TOKEN_PROD", "MP_WEBHOOK_SECRET"] as const;
export type SecretName = (typeof SECRET_NAMES)[number];

export function isSecretName(v: string): v is SecretName {
  return (SECRET_NAMES as readonly string[]).includes(v);
}

export const SECRET_LIMITS = { min: 8, max: 600 };

function masterKey() {
  return parseMasterKey(process.env.APP_SECRETS_KEY);
}

/** O painel só consegue gravar se a chave mestra (APP_SECRETS_KEY, 32 bytes em base64) estiver no servidor. */
export function canStoreSecrets() {
  return masterKey() !== null && createAdminClient() !== null;
}

const TTL_MS = 20_000;
const cache = new Map<SecretName, { value: string | null; at: number }>();

async function fromPanel(name: SecretName): Promise<string | null> {
  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const key = masterKey();
  const admin = createAdminClient();
  let value: string | null = null;
  if (key && admin) {
    const { data } = await admin.from("integration_secrets").select("ciphertext").eq("name", name).maybeSingle();
    if (data?.ciphertext) value = decryptSecret(data.ciphertext, name, key);
  }
  cache.set(name, { value, at: Date.now() });
  return value;
}

export async function getOpenAiKey() {
  return (await fromPanel("OPENAI_API_KEY")) ?? envOpenAiKey();
}

export async function getMpAccessToken(env: MpEnvironment) {
  return (await fromPanel(env === "prod" ? "MP_ACCESS_TOKEN_PROD" : "MP_ACCESS_TOKEN_TEST")) ?? envMpToken(env);
}

export async function getMpWebhookSecret() {
  return (await fromPanel("MP_WEBHOOK_SECRET")) ?? envMpWebhook();
}

export type SecretStatus = { name: SecretName; source: "painel" | "ambiente" | null; last4: string | null };

/** Estado de cada credencial, sem expor valores. */
export async function secretStatuses(): Promise<Record<SecretName, SecretStatus>> {
  const admin = createAdminClient();
  const rows = admin ? (await admin.from("integration_secrets").select("name,last4")).data ?? [] : [];
  const stored = new Map(rows.map((r) => [r.name as string, r.last4 as string]));
  const envHas: Record<SecretName, boolean> = {
    OPENAI_API_KEY: !!envOpenAiKey(),
    MP_ACCESS_TOKEN_TEST: !!envMpToken("test"),
    MP_ACCESS_TOKEN_PROD: !!envMpToken("prod"),
    MP_WEBHOOK_SECRET: !!envMpWebhook(),
  };
  const out = {} as Record<SecretName, SecretStatus>;
  for (const name of SECRET_NAMES) {
    const last4 = stored.get(name) ?? null;
    out[name] = { name, source: last4 !== null ? "painel" : envHas[name] ? "ambiente" : null, last4 };
  }
  return out;
}

export async function saveSecret(name: SecretName, value: string, userId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const key = masterKey();
  const admin = createAdminClient();
  if (!key) return { ok: false, message: "APP_SECRETS_KEY não definida no servidor." };
  if (!admin) return { ok: false, message: "Supabase não configurado no servidor." };
  const { error } = await admin.from("integration_secrets").upsert({
    name,
    ciphertext: encryptSecret(value, name, key),
    last4: value.slice(-4),
    updated_at: new Date().toISOString(),
    updated_by: userId,
  });
  cache.delete(name);
  if (!error) return { ok: true };
  // Só código e mensagem do banco são registrados; o valor da credencial nunca entra no log.
  console.error("saveSecret falhou", { name, code: error.code, message: error.message });
  if (error.code === "42P01" || error.code === "PGRST205") {
    return { ok: false, message: "A tabela integration_secrets não existe: aplique a migration 20261025000000_integration_secrets.sql no Supabase." };
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return { ok: false, message: "Sem permissão no banco: confira se SUPABASE_SERVICE_ROLE_KEY é a chave service_role." };
  }
  return { ok: false, message: `Não foi possível gravar a credencial (${error.code ?? "erro desconhecido"}).` };
}

export async function removeSecret(name: SecretName): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  const { error } = await admin.from("integration_secrets").delete().eq("name", name);
  cache.delete(name);
  return !error;
}
