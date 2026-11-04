import "server-only";
import type { Settings } from "@/lib/settings";

// Dados abertos oficiais da Câmara e do Senado: chamadas diretas, sem chave e sem custo de IA.
// Uma fonte fora do ar nunca derruba a pesquisa: ela apenas não entra no resultado.

export type OpenDataItem = { title: string; summary: string; url: string; origin: "Câmara dos Deputados" | "Senado Federal"; kind: "Projeto de lei" | "Norma federal" };

const LIMIT = 5;
const TIMEOUT = 15_000;

/** Reconhece "Lei 8.078/1990", "Lei nº 8078 de 1990" e "Lei Complementar 123/2006". */
export function citedNorm(topic: string): { tipo: "LEI" | "LCP"; numero: string; ano: string } | null {
  const match = /\blei\s+(complementar\s+)?(?:n[º°o.]*\s*)?(\d{1,2}\.?\d{3}|\d{1,4})\s*(?:\/|,?\s*de\s+(?:\d{1,2}[./]\d{1,2}[./]|\d{1,2}\s+de\s+\p{L}+\s+de\s+)?)(\d{4})\b/iu.exec(topic);
  if (!match) return null;
  return { tipo: match[1] ? "LCP" : "LEI", numero: match[2].replace(".", ""), ano: match[3] };
}

type CamaraResponse = { dados?: { id: number; siglaTipo: string; numero: number; ano: number; ementa?: string }[] };

export async function searchCamara(topic: string, fetchImpl: typeof fetch = fetch): Promise<OpenDataItem[]> {
  const params = new URLSearchParams({ keywords: topic, siglaTipo: "PL", itens: String(LIMIT), ordem: "DESC", ordenarPor: "id" });
  const res = await fetchImpl(`https://dadosabertos.camara.leg.br/api/v2/proposicoes?${params}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`Câmara respondeu HTTP ${res.status}`);
  const data = (await res.json()) as CamaraResponse;
  return (data.dados ?? []).map((item) => ({
    title: `${item.siglaTipo} ${item.numero}/${item.ano}`,
    summary: item.ementa ?? "",
    url: `https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${encodeURIComponent(item.id)}`,
    origin: "Câmara dos Deputados",
    kind: "Projeto de lei",
  }));
}

type SenadoDoc = { id: string; normaNome?: string; norma?: string; ementa?: string };
type SenadoResponse = { ListaDocumento?: { documentos?: { documento?: SenadoDoc | SenadoDoc[] } } };

export async function searchSenado(topic: string, fetchImpl: typeof fetch = fetch): Promise<OpenDataItem[]> {
  const cited = citedNorm(topic);
  // A API do Senado não busca por tema: sem norma citada, não há o que perguntar a ela.
  if (!cited) return [];
  const res = await fetchImpl(`https://legis.senado.leg.br/dadosabertos/legislacao/lista?${new URLSearchParams(cited)}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`Senado respondeu HTTP ${res.status}`);
  const data = (await res.json()) as SenadoResponse;
  const found = data.ListaDocumento?.documentos?.documento ?? [];
  return (Array.isArray(found) ? found : [found])
    .slice(0, LIMIT)
    .map((doc) => ({
      title: doc.normaNome ?? doc.norma ?? `Norma ${doc.id}`,
      summary: (doc.ementa ?? "").replace(/\s+/g, " ").trim(),
      url: `https://legis.senado.leg.br/norma/${encodeURIComponent(doc.id)}`,
      origin: "Senado Federal",
      kind: "Norma federal",
    }));
}

/** Pesquisa nas fontes ligadas pelo administrador. */
export async function searchOpenData(topic: string, sources: Settings["open_data"], fetchImpl: typeof fetch = fetch): Promise<OpenDataItem[]> {
  const calls = [...(sources.senado ? [searchSenado(topic, fetchImpl)] : []), ...(sources.camara ? [searchCamara(topic, fetchImpl)] : [])];
  const results = await Promise.allSettled(calls);
  return results.flatMap((result) => {
    if (result.status === "fulfilled") return result.value;
    console.error("Dados abertos indisponíveis", { message: result.reason instanceof Error ? result.reason.message : "erro" });
    return [];
  });
}
