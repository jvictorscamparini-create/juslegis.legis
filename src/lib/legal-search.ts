import type { Settings } from "@/lib/settings";

// Regras puras das telas de pesquisa jurídica. Sem I/O, para poderem ser testadas.

export const LEGAL_SCOPES = ["all", "legislation", "case_law"] as const;
export type LegalScope = (typeof LEGAL_SCOPES)[number];
export type SearchCategory = "legislation" | "summaries" | "case_law";

const SCOPE_CATEGORIES: Record<LegalScope, SearchCategory[]> = {
  all: ["legislation", "summaries", "case_law"],
  legislation: ["legislation", "summaries"],
  case_law: ["case_law"],
};

/** Categorias que a tela pode pesquisar, respeitando as fontes e os módulos ligados pelo administrador. */
export function scopeCategories(scope: LegalScope, settings: Pick<Settings, "legal" | "features">): SearchCategory[] {
  return SCOPE_CATEGORIES[scope].filter(
    (category) =>
      settings.legal.sources[category] &&
      (category === "legislation" ? settings.features.legislation : settings.features.case_law),
  );
}

/** Motivo de a tela estar indisponível, ou null se a pesquisa pode ser usada. */
export function searchUnavailableReason(scope: LegalScope, settings: Pick<Settings, "legal" | "features"> | null): string | null {
  if (!settings) return "A pesquisa está indisponível no momento.";
  if (settings.legal.provider !== "oficial") return "A pesquisa em fontes oficiais ainda não foi ativada pelo administrador.";
  if (!scopeCategories(scope, settings).length) return "Esta fonte está desativada pelo administrador.";
  return null;
}
