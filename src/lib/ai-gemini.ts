import "server-only";
import type { AiMessage, AiResult } from "@/lib/ai";

// Integração com o Gemini pela API REST. A chave vai só no cabeçalho, nunca na URL.

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const failure = (code: Extract<AiResult, { ok: false }>["code"], message: string): AiResult => ({ ok: false, code, message });

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

export function toGeminiContents(input: AiMessage[]): GeminiContent[] {
  return input.map((message) => {
    if (message.role === "assistant") return { role: "model", parts: [{ text: message.content }] };
    return {
      role: "user",
      parts: message.content.map((part): GeminiPart =>
        part.type === "input_text"
          ? { text: part.text }
          : { inlineData: { mimeType: "application/pdf", data: part.file_data.replace(/^data:[^,]*,/, "") } },
      ),
    };
  });
}

type GeminiResponse = {
  modelVersion?: string;
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
};

export async function generateWithGemini(opts: {
  apiKey: string;
  model: string;
  instructions: string;
  input: AiMessage[];
  temperature: number;
  maxOutputTokens: number | null;
  fetchImpl?: typeof fetch;
}): Promise<AiResult> {
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(`${BASE}/${encodeURIComponent(opts.model)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": opts.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.instructions }] },
        contents: toGeminiContents(opts.input),
        generationConfig: {
          temperature: opts.temperature,
          ...(opts.maxOutputTokens ? { maxOutputTokens: opts.maxOutputTokens } : {}),
        },
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    return failure("network", "Não foi possível contatar o Gemini. Nenhuma resposta foi gerada.");
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) return failure("auth", "A credencial do Gemini foi recusada. Nenhuma resposta foi gerada.");
    if (res.status === 404) return failure("model", "O modelo do Gemini configurado não está disponível para esta credencial. Nenhuma resposta foi gerada.");
    if (res.status === 429) return failure("quota", "Limite de uso do Gemini atingido. Tente novamente mais tarde.");
    console.error("Gemini retornou erro", { status: res.status, model: opts.model });
    return failure("upstream", "O Gemini retornou um erro. Nenhuma resposta foi gerada.");
  }
  const data = (await res.json().catch(() => ({}))) as GeminiResponse;
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
  if (!text) return failure("upstream", "O Gemini não devolveu texto. Nenhuma resposta foi gerada.");
  const usage = data.usageMetadata ?? {};
  return {
    ok: true,
    text,
    model: data.modelVersion ?? opts.model,
    inputTokens: usage.promptTokenCount ?? 0,
    outputTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
  };
}
