import { afterEach, describe, expect, it, vi } from "vitest";
import { searchOfficialLegalSources } from "@/lib/legal-research";

afterEach(() => vi.unstubAllEnvs());

async function domainsSent() {
  vi.stubEnv("OPENAI_API_KEY", "k");
  let sent: string[] = [];
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body)).tools[0].filters.allowed_domains;
    return new Response(JSON.stringify({ output: [] }), { status: 200 });
  }) as unknown as typeof fetch;
  await searchOfficialLegalSources({
    model: "modelo-x",
    topic: "tema",
    petitionType: "",
    area: "",
    categories: ["legislation", "summaries", "case_law"],
    fetchImpl,
  });
  return sent;
}

describe("domínios oficiais da pesquisa", () => {
  it("respeita o limite de 100 domínios da OpenAI, sem repetir", async () => {
    const domains = await domainsSent();
    expect(domains.length).toBeLessThanOrEqual(100);
    expect(new Set(domains).size).toBe(domains.length);
  });

  it("cobre tribunais superiores, federais, do trabalho, estaduais e eleitorais", async () => {
    const domains = await domainsSent();
    expect(domains).toEqual(expect.arrayContaining(["stf.jus.br", "tst.jus.br", "trf1.jus.br", "trf6.jus.br", "trt1.jus.br", "trt24.jus.br", "tjsp.jus.br", "tjdft.jus.br", "tre-sp.jus.br", "tre-df.jus.br"]));
    expect(domains.filter((d) => /^tj/.test(d))).toHaveLength(27);
    expect(domains.filter((d) => /^tre-/.test(d))).toHaveLength(27);
    expect(domains).not.toContain("trf.jus.br");
    expect(domains).not.toContain("trt.jus.br");
    expect(domains).not.toContain("tre.jus.br");
  });
});
