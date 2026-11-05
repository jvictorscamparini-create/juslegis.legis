import { afterEach, describe, expect, it, vi } from "vitest";
import { generate, samplingParams, usageFrom } from "@/lib/ai";
import { testOpenAIResponses } from "@/lib/connection-tests";
import { DEFAULT_SETTINGS } from "@/lib/settings";

const cfg = { ...DEFAULT_SETTINGS.ai_model, model: "modelo-x" };
const input = [{ role: "user" as const, content: [{ type: "input_text" as const, text: "oi" }] }];
const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

afterEach(() => vi.unstubAllEnvs());

describe("samplingParams", () => {
  it("só envia temperature quando o modelo aceita", () => {
    expect(samplingParams("gpt-6-luna", 0.2)).toEqual({ reasoning: { effort: "none" }, temperature: 0.2 });
    expect(samplingParams("gpt-6.1-terra", 0.2)).toEqual({ reasoning: { effort: "none" }, temperature: 0.2 });
    expect(samplingParams("gpt-6-astra", 0.2)).toEqual({ reasoning: { effort: "low" } });
    expect(samplingParams("gpt-6.1-sol", 0.2)).toEqual({ reasoning: { effort: "low" } });
    expect(samplingParams("gpt-5.4-mini", 0.2)).toEqual({});
    expect(samplingParams("gpt-4.1-mini", 0.2)).toEqual({ temperature: 0.2 });
  });
});

describe("generate (OpenAI)", () => {
  it("falha sem chave e sem modelo, sem chamar a rede", async () => {
    const f = vi.fn();
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(await generate({ config: cfg, input, fetchImpl: f as unknown as typeof fetch })).toMatchObject({ ok: false, code: "not_configured" });
    vi.stubEnv("OPENAI_API_KEY", "k");
    expect(await generate({ config: DEFAULT_SETTINGS.ai_model, input, fetchImpl: f as unknown as typeof fetch })).toMatchObject({ ok: false, code: "no_model" });
    expect(f).not.toHaveBeenCalled();
  });
  it("mapeia erros HTTP e extrai texto e tokens", async () => {
    vi.stubEnv("OPENAI_API_KEY", "k");
    expect(await generate({ config: cfg, input, fetchImpl: reply(401, {}) })).toMatchObject({ code: "auth" });
    expect(await generate({ config: cfg, input, fetchImpl: reply(403, {}) })).toMatchObject({ code: "forbidden" });
    expect(await generate({ config: cfg, input, fetchImpl: reply(429, {}) })).toMatchObject({ code: "quota" });
    const ok = await generate({
      config: cfg,
      input,
      fetchImpl: reply(200, { model: "modelo-x", output: [{ type: "message", content: [{ type: "output_text", text: "Olá" }] }], usage: { input_tokens: 5, output_tokens: 7 } }),
    });
    expect(ok).toEqual({
      ok: true,
      text: "Olá",
      model: "modelo-x",
      requestId: null,
      inputTokens: 5,
      cachedInputTokens: 0,
      outputTokens: 7,
      reasoningTokens: 0,
      toolCalls: {},
    });
  });

  it("lê o uso real da API: id, tokens em cache, raciocínio e ferramentas", () => {
    expect(
      usageFrom(
        {
          id: "resp_123",
          model: "gpt-x-2026-01-01",
          output: [{ type: "web_search_call" }, { type: "web_search_call" }, { type: "message" }],
          usage: {
            input_tokens: 1000,
            output_tokens: 200,
            input_tokens_details: { cached_tokens: 400 },
            output_tokens_details: { reasoning_tokens: 50 },
          },
        },
        "fallback",
      ),
    ).toEqual({
      model: "gpt-x-2026-01-01",
      requestId: "resp_123",
      inputTokens: 1000,
      cachedInputTokens: 400,
      outputTokens: 200,
      reasoningTokens: 50,
      toolCalls: { web_search_call: 2 },
    });
  });
});

describe("testOpenAIResponses (nunca simula sucesso)", () => {
  it("sem chave → falha", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect((await testOpenAIResponses("")).ok).toBe(false);
  });
  it("testa a Responses API e o modelo configurado", async () => {
    vi.stubEnv("OPENAI_API_KEY", "k");
    expect((await testOpenAIResponses("a", reply(401, {}))).ok).toBe(false);
    expect((await testOpenAIResponses("b", reply(404, { error: { code: "model_not_found" } }))).ok).toBe(false);
    expect((await testOpenAIResponses("a", reply(200, {
      model: "a",
      output: [{ type: "message", content: [{ type: "output_text", text: "OK" }] }],
    }))).ok).toBe(true);
  });
});
