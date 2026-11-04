import { beforeEach, describe, expect, it, vi } from "vitest";
import { scopeCategories, searchUnavailableReason } from "@/lib/legal-search";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings";

const mocks = vi.hoisted(() => ({
  loadAllSettings: vi.fn(),
  recordUsage: vi.fn(),
  search: vi.fn(),
  checkAiAllowed: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  apiRequireUser: async () => ({ ok: true, ctx: { supabase: {}, user: { id: "u1" } } }),
  jsonError: (status: number, error: string) => new Response(JSON.stringify({ error }), { status }),
}));
vi.mock("@/lib/runtime", () => ({
  loadAllSettings: mocks.loadAllSettings,
  loadAccess: async () => ({ kind: "trial", trialEndsAt: new Date() }),
  loadUsage: async () => ({}),
  recordUsage: mocks.recordUsage,
}));
vi.mock("@/lib/access", () => ({ checkAiAllowed: mocks.checkAiAllowed }));
vi.mock("@/lib/legal-research", async (original) => ({
  ...(await original<typeof import("@/lib/legal-research")>()),
  searchOfficialLegalSources: mocks.search,
}));

const settings = (over: Partial<Settings["legal"]> = {}, features: Partial<Settings["features"]> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  ai_model: { ...DEFAULT_SETTINGS.ai_model, model: "modelo-x" },
  features: { ...DEFAULT_SETTINGS.features, legislation: true, case_law: true, ...features },
  legal: {
    ...DEFAULT_SETTINGS.legal,
    provider: "oficial",
    sources: { ...DEFAULT_SETTINGS.legal.sources, legislation: true, summaries: true, case_law: true },
    ...over,
  },
});

const post = async (body: unknown) => {
  const { POST } = await import("@/app/api/legal/search/route");
  return POST(new Request("http://teste/api/legal/search", { method: "POST", body: JSON.stringify(body) }));
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkAiAllowed.mockReturnValue(null);
  mocks.loadAllSettings.mockResolvedValue(settings());
});

describe("categorias de cada tela", () => {
  it("separa as três telas", () => {
    expect(scopeCategories("all", settings())).toEqual(["legislation", "summaries", "case_law"]);
    expect(scopeCategories("legislation", settings())).toEqual(["legislation", "summaries"]);
    expect(scopeCategories("case_law", settings())).toEqual(["case_law"]);
  });

  it("respeita fontes e módulos desligados", () => {
    expect(scopeCategories("all", settings({}, { case_law: false }))).toEqual(["legislation"]);
    const noLaw = settings({ sources: { ...settings().legal.sources, legislation: false } });
    expect(scopeCategories("legislation", noLaw)).toEqual(["summaries"]);
  });

  it("explica por que a tela está indisponível", () => {
    expect(searchUnavailableReason("all", null)).toBeTruthy();
    expect(searchUnavailableReason("all", settings({ provider: "" }))).toContain("não foi ativada");
    expect(searchUnavailableReason("case_law", settings({}, { case_law: false }))).toContain("desativada");
    expect(searchUnavailableReason("all", settings())).toBeNull();
  });
});

describe("POST /api/legal/search", () => {
  it("recusa tema inválido sem pesquisar", async () => {
    expect((await post({ scope: "all", topic: "x" })).status).toBe(400);
    expect((await post({ scope: "outro", topic: "tema válido" })).status).toBe(400);
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("não pesquisa enquanto o administrador não ativar as fontes oficiais", async () => {
    mocks.loadAllSettings.mockResolvedValue(settings({ provider: "" }));
    expect((await post({ scope: "all", topic: "tema válido" })).status).toBe(409);
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("respeita o bloqueio de plano ou limite", async () => {
    mocks.checkAiAllowed.mockReturnValue("Limite atingido.");
    expect((await post({ scope: "case_law", topic: "tema válido" })).status).toBe(403);
    expect(mocks.checkAiAllowed.mock.calls[0][0].feature).toBe("case_law");
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("não simula resultado quando nenhuma fonte é validada", async () => {
    mocks.search.mockResolvedValue({ ok: false, code: "no_sources" });
    expect((await post({ scope: "all", topic: "tema válido" })).status).toBe(422);
    expect(mocks.recordUsage).not.toHaveBeenCalled();
  });

  it("devolve as fontes e registra o consumo", async () => {
    const sources = [{ title: "Lei", url: "https://www.planalto.gov.br/lei", category: "legislation", verified_at: "2026-11-04" }];
    mocks.search.mockResolvedValue({ ok: true, model: "modelo-x", sources, inputTokens: 3, outputTokens: 4 });
    const response = await post({ scope: "legislation", topic: "tema válido" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sources });
    expect(mocks.search.mock.calls[0][0].categories).toEqual(["legislation", "summaries"]);
    expect(mocks.recordUsage).toHaveBeenCalledWith(expect.objectContaining({ user_id: "u1", feature: "legal_search", input_tokens: 3 }));
  });
});
