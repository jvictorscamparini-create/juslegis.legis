import "server-only";
import { getOpenAiKey } from "@/lib/secrets";
import type { Settings } from "@/lib/settings";

// Integração com a OpenAI pela Responses API. A chave nunca sai do servidor.

export type AiInputPart =
  | { type: "input_text"; text: string }
  | { type: "input_file"; filename: string; file_data: string };

export type AiMessage =
  | { role: "user"; content: AiInputPart[] }
  | { role: "assistant"; content: string };

export type AiErrorCode = "not_configured" | "no_model" | "auth" | "forbidden" | "model" | "quota" | "upstream" | "network";

/** Uso real informado pela Responses API em uma chamada (base do cálculo de custo). */
export type UsageReport = {
  model: string;
  requestId: string | null;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  toolCalls: Record<string, number>;
};

export type AiResult = ({ ok: true; text: string } & UsageReport) | { ok: false; code: AiErrorCode; message: string };

export const DEFAULT_INSTRUCTIONS =
  "Você é o assistente jurídico da JusLegis, apoiando advogados brasileiros. Responda em português do Brasil, " +
  "de forma objetiva e técnica. Nunca invente leis, súmulas, julgados ou números de processo: quando não tiver " +
  "certeza de uma fonte, diga isso claramente e indique que a referência precisa ser verificada. " +
  "Todo conteúdo é uma sugestão e deve ser revisado pelo advogado responsável.";

const ERROR_MESSAGES: Record<AiErrorCode, string> = {
  not_configured:
    "A API de IA ainda não está conectada. Nenhuma resposta foi gerada. A configuração é feita pelo administrador da plataforma.",
  no_model: "Nenhum modelo de IA foi autorizado pelo administrador. Nenhuma resposta foi gerada.",
  auth: "A credencial da OpenAI foi recusada (401): a chave é inválida, foi revogada ou foi colada incompleta. Nenhuma resposta foi gerada.",
  forbidden:
    "A OpenAI negou o acesso (403): a chave não tem permissão para este recurso, ou o projeto dela não libera o modelo configurado. Nenhuma resposta foi gerada.",
  model: "O modelo configurado não está disponível para esta credencial. Nenhuma resposta foi gerada.",
  quota: "Limite de uso da OpenAI atingido. Tente novamente mais tarde.",
  upstream: "A OpenAI retornou um erro. Nenhuma resposta foi gerada.",
  network: "Não foi possível contatar a OpenAI. Nenhuma resposta foi gerada.",
};

export function aiError(code: AiErrorCode): AiResult {
  return { ok: false, code, message: ERROR_MESSAGES[code] };
}

export type ResponsesApiUsage = {
  id?: string;
  model?: string;
  output?: { type?: string }[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens_details?: { reasoning_tokens?: number };
  };
};

type ResponsesApiOutput = Omit<ResponsesApiUsage, "output"> & {
  output?: { type: string; content?: { type: string; text?: string }[] }[];
  error?: { message?: string; code?: string } | null;
};

/** Itens de ferramenta na saída (web_search_call, file_search_call...), contados por tipo para o custo adicional. */
export function countToolCalls(data: ResponsesApiUsage) {
  const counts: Record<string, number> = {};
  for (const item of data.output ?? []) {
    if (item.type?.endsWith("_call")) counts[item.type] = (counts[item.type] ?? 0) + 1;
  }
  return counts;
}

export function usageFrom(data: ResponsesApiUsage, fallbackModel: string): UsageReport {
  return {
    model: data.model ?? fallbackModel,
    requestId: data.id ?? null,
    inputTokens: data.usage?.input_tokens ?? 0,
    cachedInputTokens: data.usage?.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
    reasoningTokens: data.usage?.output_tokens_details?.reasoning_tokens ?? 0,
    toolCalls: countToolCalls(data),
  };
}

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

export async function generate(opts: {
  config: Settings["ai_model"];
  instructions?: string;
  input: AiMessage[];
  fetchImpl?: typeof fetch;
}): Promise<AiResult> {
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
    if (res.status === 401) return aiError("auth");
    if (res.status === 403) {
      // Só status, código e modelo: a mensagem da OpenAI pode repetir parte do que foi enviado.
      console.error("OpenAI negou o acesso", { status: res.status, code: data.error?.code ?? null, model: opts.config.model });
      return aiError("forbidden");
    }
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
  return { ok: true, text, ...usageFrom(data, opts.config.model) };
}
