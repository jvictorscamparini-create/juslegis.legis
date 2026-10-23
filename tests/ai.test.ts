import { afterEach, describe, expect, it, vi } from "vitest";
import { generate } from "@/lib/ai";
import { testOpenAIResponses } from "@/lib/connection-tests";
import { DEFAULT_SETTINGS } from "@/lib/settings";

const cfg = { ...DEFAULT_SETTINGS.ai_model, model: "modelo-x" };
const input = [{ role: "user" as const, content: [{ type: "input_text" as const, text: "oi" }] }];
const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

afterEach(() => vi.unstubAllEnvs());

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
    expect(await generate({ config: cfg, input, fetchImpl: reply(429, {}) })).toMatchObject({ code: "quota" });
    const ok = await generate({
      config: cfg,
      input,
      fetchImpl: reply(200, { model: "modelo-x", output: [{ type: "message", content: [{ type: "output_text", text: "Olá" }] }], usage: { input_tokens: 5, output_tokens: 7 } }),
    });
    expect(ok).toEqual({ ok: true, text: "Olá", model: "modelo-x", inputTokens: 5, outputTokens: 7 });
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
