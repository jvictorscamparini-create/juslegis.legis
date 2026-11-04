import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAiAllowed } from "@/lib/access";
import { apiRequireUser, jsonError } from "@/lib/auth";
import { legalResearchFailure, searchOfficialLegalSources } from "@/lib/legal-research";
import { LEGAL_SCOPES, scopeCategories, searchUnavailableReason } from "@/lib/legal-search";
import { searchOpenData } from "@/lib/open-data";
import { loadAccess, loadAllSettings, loadUsage, recordUsage } from "@/lib/runtime";

export const maxDuration = 120;

const bodySchema = z.object({
  scope: z.enum(LEGAL_SCOPES),
  topic: z.string().trim().min(3).max(300),
});

/** Pesquisa avulsa em fontes oficiais. Devolve só links conferidos; nada é salvo além do consumo. */
export async function POST(request: Request) {
  const auth = await apiRequireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Informe um tema jurídico válido, com pelo menos 3 caracteres.");
  const { scope, topic } = parsed.data;

  const settings = await loadAllSettings();
  const unavailable = searchUnavailableReason(scope, settings);
  if (!settings || unavailable) return jsonError(409, unavailable ?? "A pesquisa está indisponível no momento.");
  const categories = scopeCategories(scope, settings);

  const [access, usage] = await Promise.all([loadAccess(supabase, user.id), loadUsage(supabase, user.id)]);
  const blocked = checkAiAllowed({
    feature: categories.includes("legislation") ? "legislation" : "case_law",
    settings,
    access,
    usage,
  });
  if (blocked) return jsonError(403, blocked, { code: "blocked" });

  // A pesquisa web continua na OpenAI, mesmo com outro fornecedor de IA: é ela que restringe os domínios oficiais.
  const [result, openData] = await Promise.all([
    searchOfficialLegalSources({ model: settings.ai_model.model, topic, petitionType: "", area: "", categories }),
    categories.includes("legislation") ? searchOpenData(topic, settings.open_data) : Promise.resolve([]),
  ]);
  if (!result.ok) {
    // Sem links da pesquisa web, os dados abertos ainda são resultado verdadeiro para mostrar.
    if (result.code === "no_sources" && openData.length) return NextResponse.json({ sources: [], openData });
    const failure = legalResearchFailure(result.code);
    return jsonError(failure.status, failure.message, { code: result.code });
  }

  await recordUsage({
    user_id: user.id,
    feature: "legal_search",
    model: result.model,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
  });
  return NextResponse.json({ sources: result.sources, ...(openData.length ? { openData } : {}) });
}
