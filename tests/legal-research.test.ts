import { afterEach, describe, expect, it, vi } from "vitest";
import { legalResearchHash, searchOfficialLegalSources } from "@/lib/legal-research";

const categories = ["legislation"] as const;
const sourceUrl = "https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm";
const openAiReply = (url: string) => new Response(JSON.stringify({
  model: "modelo-x",
  output: [{
    type: "message",
    content: [{
      type: "output_text",
      text: "Consulta concluída.",
      annotations: [{ type: "url_citation", url_citation: { url, title: "Código de Defesa do Consumidor" } }],
    }],
  }],
  usage: { input_tokens: 10, output_tokens: 5 },
}), { status: 200 });

afterEach(() => vi.unstubAllEnvs());

describe("pesquisa de fontes jurídicas", () => {
  it("só retorna citações de domínios oficiais cujo link responde", async () => {
    vi.stubEnv("OPENAI_API_KEY", "k");
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "https://api.openai.com/v1/responses") {
        const body = JSON.parse(String(init?.body));
        expect(body.tools[0].filters.allowed_domains).toContain("planalto.gov.br");
        expect(body.store).toBe(false);
        return openAiReply(sourceUrl);
      }
      return new Response("", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await searchOfficialLegalSources({
      model: "modelo-x",
      topic: "Responsabilidade por vício do produto",
      petitionType: "Petição inicial",
      area: "Consumidor",
      categories: [...categories],
      fetchImpl,
    });

    expect(result).toMatchObject({ ok: true, sources: [{ title: "Código de Defesa do Consumidor", url: sourceUrl, category: "legislation" }] });
  });

  it("descarta citações fora da lista oficial e links sem resposta", async () => {
    vi.stubEnv("OPENAI_API_KEY", "k");
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === "https://api.openai.com/v1/responses"
        ? openAiReply("https://example.org/lei")
        : new Response("", { status: 404 }),
    ) as unknown as typeof fetch;
    const result = await searchOfficialLegalSources({
      model: "modelo-x",
      topic: "Tema jurídico",
      petitionType: "",
      area: "",
      categories: [...categories],
      fetchImpl,
    });
    expect(result).toEqual({ ok: false, code: "no_sources" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("não segue redirecionamento para domínio externo", async () => {
    vi.stubEnv("OPENAI_API_KEY", "k");
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === "https://api.openai.com/v1/responses"
        ? openAiReply(sourceUrl)
        : new Response("", { status: 302, headers: { location: "https://example.org/redirect" } }),
    ) as unknown as typeof fetch;
    const result = await searchOfficialLegalSources({
      model: "modelo-x",
      topic: "Tema jurídico",
      petitionType: "",
      area: "",
      categories: [...categories],
      fetchImpl,
    });
    expect(result).toEqual({ ok: false, code: "no_sources" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

it("vincula a pesquisa às categorias e aos dados legais pesquisados", () => {
  const base = { topic: "Tema", petitionType: "Inicial", area: "Cível", categories: ["legislation" as const], foundations: ["Lei 1"] };
  expect(legalResearchHash(base)).toBe(legalResearchHash({ ...base, categories: [...base.categories].reverse() }));
  expect(legalResearchHash(base)).not.toBe(legalResearchHash({ ...base, topic: "Outro tema" }));
  expect(legalResearchHash(base)).not.toBe(legalResearchHash({ ...base, foundations: ["Lei 2"] }));
});
