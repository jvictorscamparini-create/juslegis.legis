import "server-only";
import { generateWithClaude } from "@/lib/ai-anthropic";
import { generateWithGemini } from "@/lib/ai-gemini";
import { getOpenAiKey, getProviderKey } from "@/lib/secrets";
import type { Settings } from "@/lib/settings";

// Geração de texto. A OpenAI usa a Responses API aqui; Claude e Gemini têm arquivos próprios.
// As chaves nunca saem do servidor.

export type AiInputPart =
  | { type: "input_text"; text: string }
  | { type: "input_file"; filename: string; file_data: string };

export type AiMessage =
  | { role: "user"; content: AiInputPart[] }
  | { role: "assistant"; content: string };

export type AiErrorCode = "not_configured" | "no_model" | "auth" | "model" | "quota" | "upstream" | "network";

export type AiResult =
  | { ok: true; text: string; model: string; inputTokens: number; outputTokens: number }
  | { ok: false; code: AiErrorCode; message: string };

export const DEFAULT_INSTRUCTIONS =
  "Você é o assistente jurídico da JusLegis, apoiando advogados brasileiros. Responda em português do Brasil, " +
  "de forma objetiva e técnica. Nunca invente leis, súmulas, julgados ou números de processo: quando não tiver " +
  "certeza de uma fonte, diga isso claramente e indique que a referência precisa ser verificada. " +
  "Todo conteúdo é uma sugestão e deve ser revisado pelo advogado responsável.";

const ERROR_MESSAGES: Record<AiErrorCode, string> = {
  not_configured:
    "A API de IA ainda não está conectada. Nenhuma resposta foi gerada. A configuração é feita pelo administrador da plataforma.",
  no_model: "Nenhum modelo de IA foi autorizado pelo administrador. Nenhuma resposta foi gerada.",
  auth: "A credencial da OpenAI foi recusada. Nenhuma resposta foi gerada.",
  model: "O modelo configurado não está disponível para esta credencial. Nenhuma resposta foi gerada.",
  quota: "Limite de uso da OpenAI atingido. Tente novamente mais tarde.",
  upstream: "A OpenAI retornou um erro. Nenhuma resposta foi gerada.",
  network: "Não foi possível contatar a OpenAI. Nenhuma resposta foi gerada.",
};

export function aiError(code: AiErrorCode): AiResult {
  return { ok: false, code, message: ERROR_MESSAGES[code] };
}

type ResponsesApiOutput = {
  model?: string;
  output?: { type: string; content?: { type: string; text?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string; code?: string } | null;
};

export function extractOutputText(data: ResponsesApiOutput) {
  return (data.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((c) => c.type === "output_text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("\n")
    .trim();
}

/**
 * A OpenAI só aceita temperature sem raciocínio. GPT-6 Astra e 6.1 Sol não têm esforço "none";
 * os demais GPT-6 têm. GPT-5 e série o recusam temperature, e modelos anteriores não têm raciocínio.
 */
export function samplingParams(model: string, temperature: number): Record<string, unknown> {
  if (/^gpt-6-astra|^gpt-6\.1-sol/.test(model)) return { reasoning: { effort: "low" } };
  if (/^gpt-6/.test(model)) return { reasoning: { effort: "none" }, temperature };
  if (/^gpt-5|^o\d/.test(model)) return {};
  return { temperature };
}

/** Modelo em uso e presença da chave do fornecedor escolhido. Nada aqui devolve valores. */
export async function selectedProviderReady(settings: Pick<Settings, "ai_model" | "ai_routing">): Promise<boolean> {
  const { provider, anthropic_model, gemini_model } = settings.ai_routing;
  if (provider === "anthropic") return !!anthropic_model && !!(await getProviderKey("ANTHROPIC_API_KEY"));
  if (provider === "gemini") return !!gemini_model && !!(await getProviderKey("GEMINI_API_KEY"));
  return !!settings.ai_model.model && !!(await getOpenAiKey());
}

export async function generate(opts: {
  config: Settings["ai_model"];
  /** Fornecedor escolhido no painel. Sem ele, usa a OpenAI (testes de conexão da OpenAI dependem disso). */
  routing?: Settings["ai_routing"];
  instructions?: string;
  input: AiMessage[];
  fetchImpl?: typeof fetch;
}): Promise<AiResult> {
  if (opts.routing?.provider === "anthropic") {
    const apiKey = await getProviderKey("ANTHROPIC_API_KEY");
    if (!apiKey) return aiError("not_configured");
    return generateWithClaude({
      apiKey,
      model: opts.routing.anthropic_model,
      instructions: opts.instructions || DEFAULT_INSTRUCTIONS,
      input: opts.input,
      maxOutputTokens: opts.config.max_output_tokens,
      fetchImpl: opts.fetchImpl,
    });
  }
  if (opts.routing?.provider === "gemini") {
    const apiKey = await getProviderKey("GEMINI_API_KEY");
    if (!apiKey) return aiError("not_configured");
    if (!opts.routing.gemini_model) return aiError("no_model");
    return generateWithGemini({
      apiKey,
      model: opts.routing.gemini_model,
      instructions: opts.instructions || DEFAULT_INSTRUCTIONS,
      input: opts.input,
      temperature: opts.config.temperature,
      maxOutputTokens: opts.config.max_output_tokens,
      fetchImpl: opts.fetchImpl,
    });
  }

  const key = await getOpenAiKey();
  if (!key) return aiError("not_configured");
  if (!opts.config.model) return aiError("no_model");

  const body: Record<string, unknown> = {
    model: opts.config.model,
    instructions: opts.instructions || DEFAULT_INSTRUCTIONS,
    input: opts.input,
    ...samplingParams(opts.config.model, opts.config.temperature),
    store: false,
  };
  if (opts.config.max_output_tokens) body.max_output_tokens = opts.config.max_output_tokens;

  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    return aiError("network");
  }

  const data = (await res.json().catch(() => ({}))) as ResponsesApiOutput;
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) return aiError("auth");
    if (res.status === 404 || data.error?.code === "model_not_found") return aiError("model");
    if (res.status === 429) return aiError("quota");
    // Só status e código: a mensagem da OpenAI pode repetir parte do que foi enviado.
    console.error("OpenAI retornou erro", { status: res.status, code: data.error?.code ?? null, model: opts.config.model });
    return aiError("upstream");
  }
  const text = extractOutputText(data);
  if (!text) {
    console.error("OpenAI respondeu sem texto", { model: opts.config.model });
    return aiError("upstream");
  }
  return {
    ok: true,
    text,
    model: data.model ?? opts.config.model,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}
