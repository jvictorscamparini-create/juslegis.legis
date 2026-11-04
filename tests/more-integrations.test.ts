import { describe, expect, it, vi } from "vitest";
import { generateWithClaude, toClaudeMessages } from "@/lib/ai-anthropic";
import { generateWithGemini, toGeminiContents } from "@/lib/ai-gemini";
import { citedNorm, searchCamara, searchOpenData, searchSenado } from "@/lib/open-data";
import { lookupEscavador, lookupJudit, mapEscavador, mapJudit } from "@/lib/process-lookup";
import { normalizeCnj, processLookupBlocked } from "@/lib/process-lookup-rules";
import { DEFAULT_SETTINGS, mergeSettings, parseSetting, type Settings } from "@/lib/settings";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const input = [{ role: "user" as const, content: [{ type: "input_text" as const, text: "Olá" }, { type: "input_file" as const, filename: "a.pdf", file_data: "data:application/pdf;base64,QUJD" }] }];

describe("configurações novas", () => {
  it("guarda padrões seguros: IA na OpenAI, consulta paga desligada e fora do teste grátis", () => {
    expect(DEFAULT_SETTINGS.ai_routing.provider).toBe("openai");
    expect(DEFAULT_SETTINGS.process_lookup).toEqual({ provider: "", daily_limit_user: 10, allow_trial: false });
    expect(DEFAULT_SETTINGS.open_data).toEqual({ camara: false, senado: false });
  });

  it("não altera ai_model: continua aceitando só a OpenAI, compatível com a versão em produção", () => {
    expect(parseSetting("ai_model", { provider: "anthropic", model: "x", temperature: 0, max_output_tokens: null }).success).toBe(false);
  });

  it("recusa modelo Claude fora da lista e valores inválidos", () => {
    expect(parseSetting("ai_routing", { provider: "anthropic", anthropic_model: "claude-x", gemini_model: "" }).success).toBe(false);
    expect(parseSetting("process_lookup", { provider: "outro", daily_limit_user: 10, allow_trial: false }).success).toBe(false);
    expect(mergeSettings([{ key: "ai_routing", value: { provider: "x" } }]).ai_routing.provider).toBe("openai");
  });
});

describe("Claude", () => {
  it("coloca o PDF antes do texto", () => {
    const [message] = toClaudeMessages(input);
    expect(message.content).toMatchObject([{ type: "document", source: { media_type: "application/pdf", data: "QUJD" } }, { type: "text", text: "Olá" }]);
  });

  const base = { apiKey: "k-teste-123", model: "claude-opus-5-5", instructions: "regras", input, maxOutputTokens: null };

  it("envia sem temperatura, com rota alternativa, e devolve texto e consumo", async () => {
    const fetchImpl = vi.fn(async (...[]: [unknown, RequestInit?]) =>
      json({ id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: "Resposta" }], usage: { input_tokens: 5, output_tokens: 7 } }),
    );
    const result = await generateWithClaude({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toEqual({ ok: true, text: "Resposta", model: "claude-opus-5-5", inputTokens: 5, outputTokens: 7 });
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    expect(body.temperature).toBeUndefined();
    expect(body.thinking).toBeUndefined();
    expect(body.fallbacks).toBe("default");
    expect(body.system).toBe("regras");
  });

  it("não envia rota alternativa no Haiku", async () => {
    const fetchImpl = vi.fn(async (...[]: [unknown, RequestInit?]) =>
      json({ id: "m", type: "message", role: "assistant", model: "claude-haiku-5-5", stop_reason: "end_turn", content: [{ type: "text", text: "ok" }], usage: { input_tokens: 1, output_tokens: 1 } }),
    );
    await generateWithClaude({ ...base, model: "claude-haiku-5-5", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body)).fallbacks).toBeUndefined();
  });

  it("não simula resposta em recusa", async () => {
    const fetchImpl = async () => json({ id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "refusal", content: [], usage: { input_tokens: 1, output_tokens: 0 } });
    expect(await generateWithClaude({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch })).toMatchObject({ ok: false, code: "upstream" });
  });

  it("traduz credencial recusada e limite", async () => {
    const auth = async () => json({ type: "error", error: { type: "authentication_error", message: "x" } }, 401);
    expect(await generateWithClaude({ ...base, fetchImpl: auth as unknown as typeof fetch })).toMatchObject({ ok: false, code: "auth" });
    const quota = async () => json({ type: "error", error: { type: "rate_limit_error", message: "x" } }, 429);
    expect(await generateWithClaude({ ...base, fetchImpl: quota as unknown as typeof fetch })).toMatchObject({ ok: false, code: "quota" });
  });
});

describe("Gemini", () => {
  it("converte papéis e PDF", () => {
    expect(toGeminiContents([...input, { role: "assistant", content: "oi" }])).toEqual([
      { role: "user", parts: [{ text: "Olá" }, { inlineData: { mimeType: "application/pdf", data: "QUJD" } }] },
      { role: "model", parts: [{ text: "oi" }] },
    ]);
  });

  const base = { apiKey: "k-teste-123", model: "gemini-x", instructions: "regras", input, temperature: 0.2, maxOutputTokens: 100 };

  it("manda a chave só no cabeçalho, ignora raciocínio interno e soma o consumo", async () => {
    const fetchImpl = vi.fn(async (...[]: [unknown, RequestInit?]) =>
      json({ candidates: [{ content: { parts: [{ text: "pensando", thought: true }, { text: "Resposta" }] } }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 4, thoughtsTokenCount: 2 } }),
    );
    const result = await generateWithGemini({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toEqual({ ok: true, text: "Resposta", model: "gemini-x", inputTokens: 3, outputTokens: 6 });
    expect(String(fetchImpl.mock.calls[0][0])).not.toContain("k-teste-123");
    expect((fetchImpl.mock.calls[0][1]?.headers as Record<string, string>)["x-goog-api-key"]).toBe("k-teste-123");
  });

  it("não simula resposta vazia e traduz erros", async () => {
    expect(await generateWithGemini({ ...base, fetchImpl: (async () => json({ candidates: [] })) as unknown as typeof fetch })).toMatchObject({ ok: false, code: "upstream" });
    expect(await generateWithGemini({ ...base, fetchImpl: (async () => json({}, 404)) as unknown as typeof fetch })).toMatchObject({ ok: false, code: "model" });
  });
});

describe("dados abertos", () => {
  it("reconhece a norma citada no tema", () => {
    expect(citedNorm("garantia na Lei 8.078/1990")).toEqual({ tipo: "LEI", numero: "8078", ano: "1990" });
    expect(citedNorm("Lei nº 8078 de 1990")).toEqual({ tipo: "LEI", numero: "8078", ano: "1990" });
    expect(citedNorm("Lei n. 8.078, de 11 de setembro de 1990")).toEqual({ tipo: "LEI", numero: "8078", ano: "1990" });
    expect(citedNorm("Lei Complementar 123/2006")).toEqual({ tipo: "LCP", numero: "123", ano: "2006" });
    expect(citedNorm("prazo de garantia do consumidor")).toBeNull();
  });

  it("monta link oficial da Câmara", async () => {
    const fetchImpl = async () => json({ dados: [{ id: 123, siglaTipo: "PL", numero: 1, ano: 2026, ementa: "Ementa" }] });
    expect(await searchCamara("consumidor", fetchImpl as unknown as typeof fetch)).toEqual([
      { title: "PL 1/2026", summary: "Ementa", url: "https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=123", origin: "Câmara dos Deputados", kind: "Projeto de lei" },
    ]);
  });

  it("Senado: só pergunta quando há norma citada, e aceita documento único", async () => {
    const fetchImpl = vi.fn(async (...[]: [unknown]) => json({ ListaDocumento: { documentos: { documento: { id: "2", normaNome: "Lei 8.078", ementa: "Proteção  do consumidor" } } } }));
    expect(await searchSenado("garantia do consumidor", fetchImpl as unknown as typeof fetch)).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
    const items = await searchSenado("Lei 8.078/1990", fetchImpl as unknown as typeof fetch);
    expect(String(fetchImpl.mock.calls[0][0])).toContain("tipo=LEI&numero=8078&ano=1990");
    expect(items).toMatchObject([{ url: "https://legis.senado.leg.br/norma/2", summary: "Proteção do consumidor" }]);
  });

  it("fonte fora do ar não derruba a outra, e fonte desligada não é chamada", async () => {
    const fetchImpl = vi.fn(async (url: unknown) => (String(url).includes("senado") ? json({}, 500) : json({ dados: [{ id: 1, siglaTipo: "PL", numero: 1, ano: 2026 }] })));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await searchOpenData("Lei 8.078/1990", { senado: true, camara: true }, fetchImpl as unknown as typeof fetch)).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    spy.mockRestore();
    fetchImpl.mockClear();
    expect(await searchOpenData("consumidor", { senado: false, camara: false }, fetchImpl as unknown as typeof fetch)).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("consulta processual", () => {
  it("valida os dígitos do número CNJ antes de gastar uma consulta", () => {
    // Número de exemplo da documentação pública do DataJud.
    expect(normalizeCnj("0000832-35.2018.4.01.3202")).toBe("0000832-35.2018.4.01.3202");
    expect(normalizeCnj("00008323520184013202")).toBe("0000832-35.2018.4.01.3202");
    expect(normalizeCnj("0000832-36.2018.4.01.3202")).toBeNull();
    // Dígito menor que 10 precisa do zero à esquerda.
    expect(normalizeCnj("0000001-39.2024.8.26.0100")).toBe("0000001-39.2024.8.26.0100");
    expect(normalizeCnj("123")).toBeNull();
  });

  const settings = (over: Partial<Settings["process_lookup"]> = {}): Pick<Settings, "features" | "legal" | "plan" | "process_lookup"> => ({
    features: { ...DEFAULT_SETTINGS.features, process_lookup: true },
    legal: { ...DEFAULT_SETTINGS.legal, sources: { ...DEFAULT_SETTINGS.legal.sources, process_lookup: true } },
    plan: { ...DEFAULT_SETTINGS.plan, features: { ...DEFAULT_SETTINGS.plan.features, process_lookup: true } },
    process_lookup: { provider: "escavador", daily_limit_user: 2, allow_trial: false, ...over },
  });
  const subscription = { kind: "subscription" as const, trialEndsAt: new Date(0) };
  const trial = { kind: "trial" as const, trialEndsAt: new Date(0) };

  it("aplica os freios de custo", () => {
    expect(processLookupBlocked({ settings: settings(), access: subscription, usedToday: 0 })).toBeNull();
    expect(processLookupBlocked({ settings: settings({ provider: "" }), access: subscription, usedToday: 0 })).toContain("ativada");
    expect(processLookupBlocked({ settings: settings(), access: trial, usedToday: 0 })).toContain("teste gratuito");
    expect(processLookupBlocked({ settings: settings({ allow_trial: true }), access: trial, usedToday: 0 })).toBeNull();
    expect(processLookupBlocked({ settings: settings(), access: subscription, usedToday: 2 })).toContain("Limite");
    expect(processLookupBlocked({ settings: settings(), access: subscription, usedToday: null })).toContain("limite");
    expect(processLookupBlocked({ settings: settings(), access: { kind: "expired", trialEndsAt: new Date(0) }, usedToday: 0 })).toContain("terminou");
  });

  it("mapeia os campos dos fornecedores", () => {
    expect(mapEscavador("c", { numero_cnj: "n", titulo_polo_ativo: "A", titulo_polo_passivo: "B", unidade_origem: { tribunal_sigla: "TJSP" }, fontes: [{ capa: { classe: "Cível", assunto: "Dano" } }] })).toMatchObject({ cnj: "n", title: "A × B", court: "TJSP", className: "Cível", subject: "Dano" });
    expect(mapJudit("c", { code: "n", name: "A X B", tribunal_acronym: "TJSP", status: "Ativo", last_step: { step_date: "2026-01-01" }, subjects: [{ name: "Dano" }] })).toMatchObject({ cnj: "n", title: "A X B", status: "Ativo", lastMovementAt: "2026-01-01", subject: "Dano" });
  });

  it("Escavador: traduz sem crédito e não encontrado", async () => {
    expect(await lookupEscavador("c", "t", (async () => json({}, 402)) as unknown as typeof fetch)).toMatchObject({ ok: false, code: "no_credit" });
    expect(await lookupEscavador("c", "t", (async () => json({}, 404)) as unknown as typeof fetch)).toMatchObject({ ok: false, code: "not_found" });
  });

  it("Judit: cria o pedido, acompanha e devolve o processo", async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: unknown) => {
      const path = String(url).replace("https://requests.production.judit.io", "");
      calls.push(path);
      if (path === "/requests") return json({ request_id: "r1" });
      if (path === "/requests/r1") return json({ status: calls.filter((c) => c === "/requests/r1").length > 1 ? "completed" : "pending" });
      return json({ page_data: [{ response_type: "lawsuit", response_data: { code: "n", name: "A X B" } }] });
    };
    const result = await lookupJudit("c", "k", fetchImpl as unknown as typeof fetch, async () => {});
    expect(result).toMatchObject({ ok: true, process: { cnj: "n", title: "A X B" } });
    expect(calls.filter((c) => c === "/requests")).toHaveLength(1);
  });

  it("Judit: sem processo é não encontrado, e demora demais não vira sucesso", async () => {
    const empty = async (url: unknown) => (String(url).endsWith("/requests") ? json({ request_id: "r" }) : String(url).includes("/responses") ? json({ page_data: [] }) : json({ status: "completed" }));
    expect(await lookupJudit("c", "k", empty as unknown as typeof fetch, async () => {})).toMatchObject({ ok: false, code: "not_found" });
    const slow = async (url: unknown) => (String(url).endsWith("/requests") ? json({ request_id: "r" }) : json({ status: "pending" }));
    expect(await lookupJudit("c", "k", slow as unknown as typeof fetch, async () => {})).toMatchObject({ ok: false, code: "pending" });
  });
});
