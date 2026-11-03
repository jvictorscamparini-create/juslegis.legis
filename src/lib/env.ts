// Leitura centralizada das variáveis de ambiente. Segredos só são acessados no servidor.

export function supabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

export function isSupabaseConfigured() {
  return supabasePublicConfig() !== null;
}

export function serviceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

export function openAiKey() {
  // TEMPORÁRIO (Cloudflare de teste): o segredo foi cadastrado como "openaikey". Remover o segundo
  // nome depois de recadastrar a chave como OPENAI_API_KEY.
  return process.env.OPENAI_API_KEY || process.env.openaikey || null;
}

export type MpEnvironment = "test" | "prod";

export function mpEnvironment(): MpEnvironment {
  return (process.env.MERCADO_PAGO_ENVIRONMENT ?? process.env.MP_ENVIRONMENT) === "prod" ? "prod" : "test";
}

export function mpAccessToken(env: MpEnvironment = mpEnvironment()) {
  const token = env === "prod" ? process.env.MP_ACCESS_TOKEN_PROD : process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN_TEST;
  return token || null;
}

export function mpWebhookSecret() {
  return process.env.MERCADO_PAGO_WEBHOOK_SECRET || process.env.MP_WEBHOOK_SECRET || null;
}

/** Trava de cobranças: somente o valor exato "true" libera a criação de checkouts. */
export function isBillingEnabled() {
  return process.env.BILLING_ENABLED === "true";
}

export function siteUrl() {
  // Nas prévias da Vercel NEXT_PUBLIC_SITE_URL não existe; VERCEL_URL aponta para o próprio deployment.
  const vercel = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || vercel || "http://localhost:3000").replace(/\/$/, "");
}

/** Modelo OpenAI padrão (fallback; o Admin Geral pode sobrescrever no banco). */
export function openAiModelDefault() {
  return process.env.OPENAI_MODEL || null;
}

/** DataJud/CNJ: a consulta só existe se ambas as variáveis estiverem definidas. */
export function datajudConfig() {
  const url = process.env.DATAJUD_API_URL;
  const key = process.env.DATAJUD_API_KEY;
  return url && key ? { url, key } : null;
}
