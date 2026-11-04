import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { MpEnvironment } from "@/lib/env";
import { getMpAccessToken, getMpWebhookSecret, getOpenAiKey, getProviderKey } from "@/lib/secrets";
import { searchCamara, searchSenado, type OpenDataItem } from "@/lib/open-data";
import type { Settings } from "@/lib/settings";
import { generate } from "@/lib/ai";
import { mpRequest } from "@/lib/mercadopago";
import { createAdminClient } from "@/lib/supabase/admin";
import { searchOfficialLegalSources } from "@/lib/legal-research";

// Testes de conexão reais: cada um chama o serviço de verdade e só reporta sucesso se ele responder.

export type CheckResult = { ok: boolean; detail: string };
export const SERVICES = ["openai", "mp_test", "mp_prod", "supabase", "legal", "anthropic", "gemini", "escavador", "judit", "senado", "camara"] as const;
export type Service = (typeof SERVICES)[number];

export function isService(s: string): s is Service {
  return (SERVICES as readonly string[]).includes(s);
}

export async function testOpenAI(configuredModel: string, fetchImpl: typeof fetch = fetch): Promise<CheckResult> {
  const key = await getOpenAiKey();
  if (!key) return { ok: false, detail: "Chave da OpenAI não definida (informe em Integrações e APIs)." };
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

export async function testOpenAIResponses(configuredModel: string, fetchImpl: typeof fetch = fetch): Promise<CheckResult> {
  if (!(await getOpenAiKey())) return { ok: false, detail: "Chave da OpenAI não definida." };
  if (!configuredModel) return { ok: false, detail: "Selecione um modelo para testar a Responses API." };
  const result = await generate({
    config: { provider: "openai", model: configuredModel, temperature: 0, max_output_tokens: 8 },
    input: [{ role: "user", content: [{ type: "input_text", text: "Responda apenas: OK." }] }],
    fetchImpl,
  });
  return result.ok
    ? { ok: true, detail: `Responses API respondeu usando o modelo "${result.model}".` }
    : { ok: false, detail: result.message };
}

function mpRejection(status: number, message: string, code?: string) {
  const origin = `Mercado Pago respondeu HTTP ${status}${code ? ` (${code})` : ""}: ${message}`;
  if (status === 401) return `${origin} Token inválido, expirado ou copiado pela metade.`;
  if (status === 403) return `${origin} O Mercado Pago bloqueou este token por política da conta ou da aplicação; o bloqueio não vem do JusLegis.`;
  return origin;
}

/**
 * Valida o token com GET /v1/payment_methods, a chamada indicada na documentação oficial, que só lê
 * dados e não cobra. /users/me serve apenas para identificar a conta, e por isso a recusa dele
 * não reprova o token.
 * O sucesso exige que a credencial seja compatível com o campo testado.
 */
export async function testMercadoPago(env: MpEnvironment, fetchImpl: typeof fetch = fetch): Promise<CheckResult> {
  const label = env === "prod" ? "produção" : "teste";
  const token = await getMpAccessToken(env);
  if (!token) return { ok: false, detail: `Credencial do Mercado Pago (${label}) não definida no servidor.` };
  if (token === (await getMpAccessToken(env === "prod" ? "test" : "prod"))) {
    return { ok: false, detail: "A mesma credencial está nos campos de teste e de produção. Cada campo precisa da sua." };
  }

  const methods = await mpRequest<unknown[]>(env, "/v1/payment_methods", {}, fetchImpl);
  if (!methods.ok) {
    return { ok: false, detail: methods.status ? mpRejection(methods.status, methods.message, methods.code) : methods.message };
  }

  const me = await mpRequest<{ id: number; nickname?: string; site_id?: string }>(env, "/users/me", {}, fetchImpl);
  const account = me.ok ? `${me.data.nickname ?? me.data.id}, ${me.data.site_id ?? "?"}` : null;
  const isTestAccount = me.ok && /^TEST_?USER/i.test(me.data.nickname ?? "");
  const isTestToken = token.startsWith("TEST-") || isTestAccount;

  if (env === "prod" && isTestToken) {
    return { ok: false, detail: `Esta credencial é de teste${account ? ` (${account})` : ""}, não de produção. Cobranças reais não funcionariam com ela.` };
  }
  if (env === "test" && me.ok && !isTestToken) {
    return { ok: false, detail: `Esta credencial aponta para uma conta real (${account}), então não foi aceita como teste. Copie o Access Token do ambiente de Teste da aplicação.` };
  }

  const identity = account ? `Conta ${account}.` : "O Mercado Pago não informou a conta deste token, então confira se ele foi copiado do ambiente de Teste.";
  const warn = (await getMpWebhookSecret()) ? "" : " Atenção: segredo do webhook do Mercado Pago não definido — webhooks serão rejeitados.";
  return { ok: true, detail: `Token de ${label} aceito pelo Mercado Pago. ${identity}${warn}` };
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

export async function testLegal(configuredModel: string): Promise<CheckResult> {
  if (!(await getOpenAiKey())) return { ok: false, detail: "Chave da OpenAI não definida." };
  if (!configuredModel) return { ok: false, detail: "Selecione um modelo OpenAI antes de testar a pesquisa oficial." };
  const result = await searchOfficialLegalSources({
    model: configuredModel,
    topic: "Lei nº 8.078 de 1990 Código de Defesa do Consumidor",
    petitionType: "pesquisa de integração",
    area: "Direito do consumidor",
    categories: ["legislation"],
  });
  if (!result.ok) {
    return {
      ok: false,
      detail: result.code === "no_sources"
        ? "A pesquisa não retornou links oficiais válidos."
        : `A pesquisa oficial via OpenAI falhou (${result.code}).`,
    };
  }
  return { ok: true, detail: `${result.sources.length} fonte(s) oficial(is) encontradas e com URL respondendo.` };
}

/** Confere a chave e o modelo sem gerar texto: consultar o modelo não consome tokens. */
export async function testAnthropic(model: string, fetchImpl?: typeof fetch): Promise<CheckResult> {
  const key = await getProviderKey("ANTHROPIC_API_KEY");
  if (!key) return { ok: false, detail: "Chave da Anthropic não definida (informe nesta tela)." };
  const client = new Anthropic({ apiKey: key, timeout: 10_000, maxRetries: 0, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  try {
    await client.models.retrieve(model);
    return { ok: true, detail: `Credencial válida. Modelo "${model}" disponível.` };
  } catch (error) {
    if (error instanceof Anthropic.APIConnectionError) return { ok: false, detail: "Não foi possível contatar a Anthropic." };
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return { ok: false, detail: `Credencial recusada pela Anthropic (${error.status}).` };
    if (error instanceof Anthropic.NotFoundError) return { ok: false, detail: `Credencial válida, mas o modelo "${model}" não está disponível para ela.` };
    if (error instanceof Anthropic.APIError) return { ok: false, detail: `A Anthropic respondeu HTTP ${error.status}.` };
    throw error;
  }
}

export async function testGemini(model: string, fetchImpl: typeof fetch = fetch): Promise<CheckResult> {
  const key = await getProviderKey("GEMINI_API_KEY");
  if (!key) return { ok: false, detail: "Chave do Gemini não definida (informe nesta tela)." };
  if (!model) return { ok: false, detail: "Informe o modelo Gemini antes de testar." };
  try {
    const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`, {
      headers: { "x-goog-api-key": key },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 400 || res.status === 401 || res.status === 403) return { ok: false, detail: `Credencial recusada pelo Google (${res.status}).` };
    if (res.status === 404) return { ok: false, detail: `Credencial válida, mas o modelo "${model}" não está disponível para ela.` };
    if (!res.ok) return { ok: false, detail: `O Google respondeu HTTP ${res.status}.` };
    return { ok: true, detail: `Credencial válida. Modelo "${model}" disponível.` };
  } catch {
    return { ok: false, detail: "Não foi possível contatar o Google." };
  }
}

/** Consulta o saldo, que não cobra crédito. Nunca consulta um processo no teste. */
export async function testEscavador(fetchImpl: typeof fetch = fetch): Promise<CheckResult> {
  const token = await getProviderKey("ESCAVADOR_API_TOKEN");
  if (!token) return { ok: false, detail: "Token do Escavador não definido (informe nesta tela)." };
  try {
    const res = await fetchImpl("https://api.escavador.com/api/v1/quantidade-creditos", {
      headers: { Authorization: `Bearer ${token}`, "X-Requested-With": "XMLHttpRequest", Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401) return { ok: false, detail: "Token recusado pelo Escavador (401)." };
    if (!res.ok) return { ok: false, detail: `O Escavador respondeu HTTP ${res.status}.` };
    return { ok: true, detail: "Token aceito pelo Escavador. Nenhuma consulta foi cobrada." };
  } catch {
    return { ok: false, detail: "Não foi possível contatar o Escavador." };
  }
}

/** Lista pedidos já feitos, sem criar nenhum: só criar pedido é cobrado. */
export async function testJudit(fetchImpl: typeof fetch = fetch): Promise<CheckResult> {
  const key = await getProviderKey("JUDIT_API_KEY");
  if (!key) return { ok: false, detail: "Chave da Judit não definida (informe nesta tela)." };
  try {
    const res = await fetchImpl("https://requests.production.judit.io/requests?page=1&page_size=1", {
      headers: { "api-key": key, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401 || res.status === 403) return { ok: false, detail: `Chave recusada pela Judit (${res.status}).` };
    if (!res.ok) return { ok: false, detail: `A Judit respondeu HTTP ${res.status}.` };
    return { ok: true, detail: "Chave aceita pela Judit. Nenhum pedido foi criado." };
  } catch {
    return { ok: false, detail: "Não foi possível contatar a Judit." };
  }
}

async function testOpenData(search: () => Promise<OpenDataItem[]>, name: string): Promise<CheckResult> {
  try {
    const items = await search();
    return items.length
      ? { ok: true, detail: `${name} respondeu com ${items.length} resultado(s) de exemplo.` }
      : { ok: false, detail: `${name} respondeu, mas sem resultados para o tema de teste.` };
  } catch {
    return { ok: false, detail: `Não foi possível consultar ${name}.` };
  }
}

export async function runCheck(service: Service, configuredModel: string, routing: Settings["ai_routing"]): Promise<CheckResult> {
  switch (service) {
    case "anthropic":
      return testAnthropic(routing.anthropic_model);
    case "gemini":
      return testGemini(routing.gemini_model);
    case "escavador":
      return testEscavador();
    case "judit":
      return testJudit();
    case "senado":
      return testOpenData(() => searchSenado("Lei 8.078/1990"), "o Senado");
    case "camara":
      return testOpenData(() => searchCamara("consumidor"), "a Câmara");
    case "openai":
      return testOpenAIResponses(configuredModel);
    case "mp_test":
      return testMercadoPago("test");
    case "mp_prod":
      return testMercadoPago("prod");
    case "supabase":
      return testSupabase();
    case "legal":
      return testLegal(configuredModel);
  }
}
