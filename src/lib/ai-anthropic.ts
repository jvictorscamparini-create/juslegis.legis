import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AiMessage, AiResult } from "@/lib/ai";

// Integração com o Claude pelo SDK oficial. A chave nunca sai do servidor.

const DEFAULT_MAX_TOKENS = 16_000;
/** Haiku não tem a rota alternativa do servidor para recusas. */
const WITH_FALLBACK = /^claude-(opus|sonnet)-/;

const failure = (code: Extract<AiResult, { ok: false }>["code"], message: string): AiResult => ({ ok: false, code, message });

/** Converte o formato interno. O PDF segue como bloco de documento, antes do texto. */
export function toClaudeMessages(input: AiMessage[]): Anthropic.Beta.BetaMessageParam[] {
  return input.map((message) => {
    if (message.role === "assistant") return { role: "assistant", content: message.content };
    const files: Anthropic.Beta.BetaContentBlockParam[] = [];
    const texts: Anthropic.Beta.BetaContentBlockParam[] = [];
    for (const part of message.content) {
      if (part.type === "input_text") texts.push({ type: "text", text: part.text });
      else {
        files.push({
          type: "document",
          title: part.filename,
          source: { type: "base64", media_type: "application/pdf", data: part.file_data.replace(/^data:[^,]*,/, "") },
        });
      }
    }
    return { role: "user", content: [...files, ...texts] };
  });
}

export async function generateWithClaude(opts: {
  apiKey: string;
  model: string;
  instructions: string;
  input: AiMessage[];
  maxOutputTokens: number | null;
  fetchImpl?: typeof fetch;
}): Promise<AiResult> {
  const client = new Anthropic({ apiKey: opts.apiKey, timeout: 120_000, maxRetries: 1, ...(opts.fetchImpl ? { fetch: opts.fetchImpl } : {}) });
  try {
    const withFallback = WITH_FALLBACK.test(opts.model);
    const response = await client.beta.messages.create({
      model: opts.model,
      max_tokens: opts.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
      system: opts.instructions,
      messages: toClaudeMessages(opts.input),
      output_config: { effort: "high" },
      ...(withFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    if (response.stop_reason === "refusal") {
      return failure("upstream", "O Claude recusou este pedido por suas regras de segurança. Nenhuma resposta foi gerada.");
    }
    const text = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("\n")
      .trim();
    if (!text) return failure("upstream", "O Claude não devolveu texto. Nenhuma resposta foi gerada.");
    return {
      ok: true,
      text,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  } catch (error) {
    if (error instanceof Anthropic.APIConnectionError) return failure("network", "Não foi possível contatar o Claude. Nenhuma resposta foi gerada.");
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return failure("auth", "A credencial do Claude foi recusada. Nenhuma resposta foi gerada.");
    }
    if (error instanceof Anthropic.NotFoundError) return failure("model", "O modelo do Claude configurado não está disponível para esta credencial. Nenhuma resposta foi gerada.");
    if (error instanceof Anthropic.RateLimitError) return failure("quota", "Limite de uso do Claude atingido. Tente novamente mais tarde.");
    if (error instanceof Anthropic.APIError) {
      // Só status: a mensagem de erro pode repetir parte do que foi enviado.
      console.error("Claude retornou erro", { status: error.status, model: opts.model });
      return failure("upstream", "O Claude retornou um erro. Nenhuma resposta foi gerada.");
    }
    throw error;
  }
}
