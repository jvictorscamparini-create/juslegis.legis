import "server-only";
import { getProviderKey } from "@/lib/secrets";

// Consulta de processo por número CNJ nos fornecedores contratados. Cada consulta é paga e o
// resultado pode conter dados pessoais das partes: nada aqui é salvo nem registrado em log.

export type ProcessInfo = {
  cnj: string;
  title: string;
  court: string | null;
  className: string | null;
  subject: string | null;
  status: string | null;
  startedAt: string | null;
  lastMovementAt: string | null;
};

export type LookupResult =
  | { ok: true; process: ProcessInfo }
  | { ok: false; code: "not_configured" | "not_found" | "auth" | "no_credit" | "pending" | "upstream" | "network"; message: string };

const fail = (code: Extract<LookupResult, { ok: false }>["code"], message: string): LookupResult => ({ ok: false, code, message });

type EscavadorProcess = {
  numero_cnj?: string;
  titulo_polo_ativo?: string | null;
  titulo_polo_passivo?: string | null;
  data_inicio?: string | null;
  data_ultima_movimentacao?: string | null;
  unidade_origem?: { tribunal_sigla?: string | null } | null;
  fontes?: { sigla?: string | null; status_predito?: string | null; capa?: { classe?: string | null; assunto?: string | null } | null }[];
};

export function mapEscavador(cnj: string, data: EscavadorProcess): ProcessInfo {
  const source = data.fontes?.[0];
  return {
    cnj: data.numero_cnj ?? cnj,
    title: [data.titulo_polo_ativo, data.titulo_polo_passivo].filter(Boolean).join(" × ") || "Partes não informadas",
    court: data.unidade_origem?.tribunal_sigla ?? source?.sigla ?? null,
    className: source?.capa?.classe ?? null,
    subject: source?.capa?.assunto ?? null,
    status: source?.status_predito ?? null,
    startedAt: data.data_inicio ?? null,
    lastMovementAt: data.data_ultima_movimentacao ?? null,
  };
}

export async function lookupEscavador(cnj: string, token: string, fetchImpl: typeof fetch = fetch): Promise<LookupResult> {
  let res: Response;
  try {
    res = await fetchImpl(`https://api.escavador.com/api/v2/processos/numero_cnj/${encodeURIComponent(cnj)}`, {
      headers: { Authorization: `Bearer ${token}`, "X-Requested-With": "XMLHttpRequest", Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return fail("network", "Não foi possível contatar o fornecedor da consulta.");
  }
  if (res.status === 401) return fail("auth", "A credencial do Escavador foi recusada.");
  if (res.status === 402) return fail("no_credit", "A conta do Escavador está sem créditos.");
  if (res.status === 404) return fail("not_found", "O fornecedor não encontrou este processo.");
  if (!res.ok) {
    console.error("Escavador retornou erro", { status: res.status });
    return fail("upstream", "O fornecedor da consulta retornou um erro.");
  }
  return { ok: true, process: mapEscavador(cnj, (await res.json()) as EscavadorProcess) };
}

type JuditLawsuit = {
  code?: string;
  name?: string | null;
  tribunal_acronym?: string | null;
  status?: string | null;
  distribution_date?: string | null;
  last_step?: { step_date?: string | null } | string | null;
  classifications?: { name?: string | null }[] | null;
  subjects?: { name?: string | null }[] | null;
};

export function mapJudit(cnj: string, data: JuditLawsuit): ProcessInfo {
  const last = data.last_step;
  return {
    cnj: data.code ?? cnj,
    title: data.name || "Partes não informadas",
    court: data.tribunal_acronym ?? null,
    className: data.classifications?.[0]?.name ?? null,
    subject: data.subjects?.[0]?.name ?? null,
    status: data.status ?? null,
    startedAt: data.distribution_date ?? null,
    lastMovementAt: typeof last === "string" ? last : (last?.step_date ?? null),
  };
}

const JUDIT = "https://requests.production.judit.io";
const JUDIT_ATTEMPTS = 25;
const JUDIT_WAIT_MS = 4_000;

/** A Judit é assíncrona: cria o pedido e acompanha aqui no servidor até concluir. */
export async function lookupJudit(
  cnj: string,
  key: string,
  fetchImpl: typeof fetch = fetch,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<LookupResult> {
  const headers = { "api-key": key, "Content-Type": "application/json", Accept: "application/json" };
  const call = (path: string, init: RequestInit = {}) => fetchImpl(`${JUDIT}${path}`, { headers, signal: AbortSignal.timeout(20_000), ...init });
  try {
    const created = await call("/requests", {
      method: "POST",
      body: JSON.stringify({ search: { search_type: "lawsuit_cnj", search_key: cnj } }),
    });
    if (created.status === 401 || created.status === 403) return fail("auth", "A credencial da Judit foi recusada.");
    if (created.status === 402) return fail("no_credit", "A conta da Judit está sem créditos.");
    if (!created.ok) {
      console.error("Judit retornou erro", { status: created.status });
      return fail("upstream", "O fornecedor da consulta retornou um erro.");
    }
    const { request_id: id } = (await created.json()) as { request_id?: string };
    if (!id) return fail("upstream", "O fornecedor da consulta não devolveu o pedido.");

    for (let attempt = 0; attempt < JUDIT_ATTEMPTS; attempt++) {
      await wait(JUDIT_WAIT_MS);
      const statusRes = await call(`/requests/${encodeURIComponent(id)}`);
      if (!statusRes.ok) continue;
      const { status } = (await statusRes.json()) as { status?: string };
      if (status === "cancelled" || status === "cancelling") return fail("upstream", "O fornecedor cancelou a consulta.");
      if (status !== "completed") continue;

      const responses = await call(`/responses?${new URLSearchParams({ request_id: id, page: "1" })}`);
      if (!responses.ok) return fail("upstream", "O fornecedor da consulta retornou um erro.");
      const { page_data: items } = (await responses.json()) as { page_data?: { response_type?: string; response_data?: JuditLawsuit }[] };
      const lawsuit = items?.find((item) => item.response_type === "lawsuit")?.response_data;
      return lawsuit ? { ok: true, process: mapJudit(cnj, lawsuit) } : fail("not_found", "O fornecedor não encontrou este processo.");
    }
  } catch {
    return fail("network", "Não foi possível contatar o fornecedor da consulta.");
  }
  return fail("pending", "A consulta está demorando mais que o normal no tribunal. Tente novamente mais tarde.");
}

export async function lookupProcess(provider: "escavador" | "judit", cnj: string): Promise<LookupResult> {
  const key = await getProviderKey(provider === "escavador" ? "ESCAVADOR_API_TOKEN" : "JUDIT_API_KEY");
  if (!key) return fail("not_configured", "A credencial do fornecedor da consulta não foi informada pelo administrador.");
  return provider === "escavador" ? lookupEscavador(cnj, key) : lookupJudit(cnj, key);
}
