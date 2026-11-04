import "server-only";

import { createHash } from "node:crypto";
import { getOpenAiKey } from "@/lib/secrets";

export type LegalSourceCategory = "legislation" | "summaries" | "case_law";

export type VerifiedLegalSource = {
  title: string;
  url: string;
  category: "legislation" | "case_law";
  verified_at: string;
};

export type VerifiedLegalResearch = {
  topic: string;
  categories: LegalSourceCategory[];
  request_hash: string;
  consulted_at: string;
  sources: VerifiedLegalSource[];
};

type ResearchResponse = {
  model?: string;
  output?: {
    type?: string;
    content?: {
      annotations?: {
        type?: string;
        url?: string;
        title?: string;
        url_citation?: { url?: string; title?: string };
      }[];
    }[];
    action?: { sources?: { url?: string; title?: string }[] };
  }[];
  usage?: { input_tokens?: number; output_tokens?: number };
};

const UFS = ["ac", "al", "am", "ap", "ba", "ce", "df", "es", "go", "ma", "mg", "ms", "mt", "pa", "pb", "pe", "pi", "pr", "rj", "rn", "ro", "rr", "rs", "sc", "se", "sp", "to"];
const numbered = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => `${prefix}${i + 1}.jus.br`);

// A OpenAI aceita até 100 domínios por pesquisa, e cada um já cobre os seus subdomínios.
const OFFICIAL_DOMAINS: Record<LegalSourceCategory, string[]> = {
  legislation: ["planalto.gov.br", "lexml.gov.br", "senado.leg.br", "camara.leg.br"],
  summaries: ["stf.jus.br", "stj.jus.br"],
  case_law: [
    "stf.jus.br",
    "stj.jus.br",
    "tst.jus.br",
    "tse.jus.br",
    "stm.jus.br",
    ...numbered("trf", 6),
    ...numbered("trt", 24),
    ...UFS.map((uf) => (uf === "df" ? "tjdft.jus.br" : `tj${uf}.jus.br`)),
    ...UFS.map((uf) => `tre-${uf}.jus.br`),
  ],
};

export type LegalResearchResult =
  | { ok: true; model: string; sources: VerifiedLegalSource[]; inputTokens: number; outputTokens: number }
  | { ok: false; code: "not_configured" | "no_model" | "upstream" | "network" | "no_sources" };

export function legalResearchHash(input: {
  topic: string;
  petitionType: string;
  area: string;
  categories: LegalSourceCategory[];
  foundations: string[];
}) {
  const normalized = {
    topic: input.topic.trim(),
    petitionType: input.petitionType.trim(),
    area: input.area.trim(),
    categories: [...input.categories].sort(),
    foundations: input.foundations.map((foundation) => foundation.trim()).filter(Boolean).sort(),
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function allowedDomains(categories: LegalSourceCategory[]) {
  return [...new Set(categories.flatMap((category) => OFFICIAL_DOMAINS[category]))];
}

function officialUrl(value: string, domains: string[]) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      domains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))
    )
      ? url
      : null;
  } catch {
    return null;
  }
}

async function verifySourceUrl(value: string, domains: string[], fetchImpl: typeof fetch) {
  let url = officialUrl(value, domains);
  if (!url) return false;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        redirect: "manual",
        headers: { Range: "bytes=0-0" },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return false;
    }
    if (response.status >= 200 && response.status < 300) {
      await response.body?.cancel().catch(() => {});
      return true;
    }
    await response.body?.cancel().catch(() => {});
    if (response.status < 300 || response.status > 399 || redirects === 3) return false;
    const location = response.headers.get("location");
    if (!location) return false;
    try {
      url = officialUrl(new URL(location, url).toString(), domains);
    } catch {
      return false;
    }
    if (!url) return false;
  }
  return false;
}

function citationsFrom(response: ResearchResponse) {
  const citations: { url: string; title: string }[] = [];
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      for (const annotation of content.annotations ?? []) {
        if (annotation.type !== "url_citation") continue;
        const citation = annotation.url_citation;
        const url = citation?.url ?? annotation.url;
        if (url) citations.push({ url, title: citation?.title ?? annotation.title ?? url });
      }
    }
    for (const source of item.action?.sources ?? []) {
      if (source.url) citations.push({ url: source.url, title: source.title ?? source.url });
    }
  }
  return citations;
}

export async function searchOfficialLegalSources(opts: {
  model: string;
  topic: string;
  petitionType: string;
  area: string;
  categories: LegalSourceCategory[];
  fetchImpl?: typeof fetch;
}): Promise<LegalResearchResult> {
  const key = await getOpenAiKey();
  if (!key) return { ok: false, code: "not_configured" };
  if (!opts.model) return { ok: false, code: "no_model" };

  const domains = allowedDomains(opts.categories);
  if (!domains.length) return { ok: false, code: "no_sources" };
  const input = [
    "Pesquise fontes jurídicas brasileiras oficiais para o tema informado. Use somente os domínios oficiais permitidos.",
    "Não responda com aconselhamento jurídico, não invente normas ou precedentes e não trate consulta processual.",
    `Área: ${opts.area || "não informada"}. Tipo de peça: ${opts.petitionType || "não informado"}.`,
    `Tema jurídico (sem dados pessoais): ${opts.topic.trim()}`,
    "Retorne uma breve indicação do material oficial encontrado com citações de URL.",
  ].join("\n");

  let response: Response;
  try {
    response = await (opts.fetchImpl ?? fetch)("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.model,
        input,
        tools: [{ type: "web_search", filters: { allowed_domains: domains } }],
        tool_choice: "required",
        store: false,
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    return { ok: false, code: "network" };
  }
  if (!response.ok) return { ok: false, code: "upstream" };

  const data = (await response.json().catch(() => ({}))) as ResearchResponse;
  const citations = citationsFrom(data).filter((source) => officialUrl(source.url, domains));
  const seen = new Set<string>();
  const candidates = citations.filter((source) => {
    const url = officialUrl(source.url, domains);
    if (!url || seen.has(url.toString()) || seen.size >= 8) return false;
    seen.add(url.toString());
    return true;
  });
  const verified = (await Promise.all(candidates.map(async (source) => {
    const url = officialUrl(source.url, domains);
    if (!url || !(await verifySourceUrl(url.toString(), domains, opts.fetchImpl ?? fetch))) return null;
    const category = opts.categories.some((candidate) => candidate !== "legislation" && OFFICIAL_DOMAINS[candidate].some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`)))
      ? "case_law"
      : "legislation";
    return { title: source.title.slice(0, 300), url: url.toString(), category, verified_at: new Date().toISOString() } as VerifiedLegalSource;
  }))).filter((source): source is VerifiedLegalSource => !!source);
  if (!verified.length) return { ok: false, code: "no_sources" };

  return {
    ok: true,
    model: data.model ?? opts.model,
    sources: verified,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}
