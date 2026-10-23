import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAiAllowed } from "@/lib/access";
import { apiRequireUser, jsonError } from "@/lib/auth";
import { loadAccess, loadAllSettings, loadUsage, recordUsage } from "@/lib/runtime";
import { legalResearchHash, searchOfficialLegalSources, type LegalSourceCategory, type VerifiedLegalResearch } from "@/lib/legal-research";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  petitionId: z.uuid(),
  topic: z.string().trim().min(3).max(300),
});

export async function POST(request: Request) {
  const auth = await apiRequireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user, profile } = auth.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Informe um tema jurídico válido, sem dados pessoais.");

  const settings = await loadAllSettings();
  if (!settings) return jsonError(503, "Configurações indisponíveis.");
  if (settings.legal.provider !== "oficial") {
    return jsonError(409, "Selecione Fontes oficiais no painel administrativo para pesquisar.");
  }
  const categories = (["legislation", "summaries", "case_law"] as const).filter(
    (category) => settings.legal.sources[category],
  ) as LegalSourceCategory[];
  if (!categories.length) return jsonError(409, "Nenhuma fonte oficial compatível está habilitada pelo administrador.");

  const { data: petition } = await supabase
    .from("petitions")
    .select("id,form,foundations")
    .eq("id", parsed.data.petitionId)
    .maybeSingle();
  if (!petition) return jsonError(404, "Petição não encontrada.");

  const access = await loadAccess(supabase, user.id, profile?.created_at ?? user.created_at, settings.trial.days);
  const usage = await loadUsage(supabase, user.id);
  const blocked = checkAiAllowed({ feature: "petitions", settings, access, usage });
  if (blocked) return jsonError(403, blocked, { code: "blocked" });

  const form = (petition.form ?? {}) as Record<string, string>;
  const foundations = Array.isArray(petition.foundations) ? petition.foundations.filter((item): item is string => typeof item === "string") : [];
  const result = await searchOfficialLegalSources({
    model: settings.ai_model.model,
    topic: parsed.data.topic,
    petitionType: form.tipo ?? "",
    area: form.area ?? "",
    categories,
    foundations,
  });
  if (!result.ok) {
    const status = result.code === "no_model" || result.code === "not_configured" ? 503 : result.code === "no_sources" ? 422 : 502;
    const errors = {
      no_model: "Nenhum modelo de IA foi autorizado pelo administrador.",
      not_configured: "A integração com OpenAI ainda não está configurada.",
      no_sources: "Nenhuma fonte oficial foi encontrada e validada. Nenhuma referência foi adicionada.",
      upstream: "A pesquisa oficial não pôde ser concluída.",
      network: "Não foi possível contatar o serviço de pesquisa.",
    };
    return jsonError(status, errors[result.code], { code: result.code });
  }

  const consultedAt = new Date().toISOString();
  const research: VerifiedLegalResearch = {
    topic: parsed.data.topic,
    categories,
    request_hash: legalResearchHash({
      topic: parsed.data.topic,
      petitionType: form.tipo ?? "",
      area: form.area ?? "",
      categories,
      foundations,
    }),
    consulted_at: consultedAt,
    sources: result.sources,
  };
  const admin = createAdminClient();
  if (!admin) return jsonError(503, "Servidor sem configuração completa.");
  const { error } = await admin.from("petition_verified_sources").upsert(
    {
      petition_id: petition.id,
      user_id: user.id,
      topic: research.topic,
      categories: research.categories,
      request_hash: research.request_hash,
      consulted_at: research.consulted_at,
      sources: research.sources,
    },
    { onConflict: "petition_id" },
  );
  if (error) return jsonError(500, "Não foi possível salvar as fontes verificadas.");

  await recordUsage({
    user_id: user.id,
    feature: "legal_research",
    model: result.model,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
  });
  return NextResponse.json({ research });
}
