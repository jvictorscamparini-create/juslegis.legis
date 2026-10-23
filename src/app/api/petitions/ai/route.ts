import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAiAllowed } from "@/lib/access";
import { aiError, generate } from "@/lib/ai";
import { apiRequireUser, jsonError } from "@/lib/auth";
import { activePrompt, loadAccess, loadAllSettings, loadUsage, recordUsage } from "@/lib/runtime";

export const maxDuration = 120;

const bodySchema = z.object({
  petitionId: z.uuid(),
  action: z.enum(["generate", "review", "rewrite"]),
  selection: z.string().max(20_000).optional(),
  currentText: z.string().max(200_000).optional(),
});

type PetitionRow = {
  form: Record<string, string>;
  foundations: string[];
};

const FIELD_LABELS: [string, string][] = [
  ["tipo", "Tipo de peça"],
  ["area", "Área do Direito"],
  ["trib", "Justiça / tribunal"],
  ["uf", "UF / comarca"],
  ["vara", "Vara ou competência"],
  ["cnj", "Número CNJ"],
  ["autor", "Autor / requerente"],
  ["reu", "Réu / requerido"],
  ["fatos", "Fatos"],
  ["pedidos", "Pedidos"],
];

function buildPrompt(action: "generate" | "review" | "rewrite", p: PetitionRow, selection?: string, currentText?: string) {
  const data = FIELD_LABELS.map(([k, l]) => `${l}: ${p.form?.[k]?.trim() || "[não informado]"}`).join("\n");
  const funds = p.foundations?.length
    ? p.foundations.map((f) => `- ${f} (informado pelo advogado, não verificado)`).join("\n")
    : "- nenhum informado";
  if (action === "generate") {
    return (
      "Redija uma minuta da peça abaixo em português jurídico formal, com as seções: endereçamento, qualificação das partes, " +
      "dos fatos, do direito, dos pedidos e fechamento. Use colchetes [ ] para todo dado ausente. Não invente leis, súmulas, " +
      "julgados nem números: cite apenas os fundamentos listados e marque-os como pendentes de verificação. " +
      "Responda somente com o texto da peça, usando linhas em MAIÚSCULAS para os títulos das seções.\n\n" +
      `DADOS:\n${data}\n\nFUNDAMENTOS INFORMADOS:\n${funds}`
    );
  }
  if (action === "review") {
    return (
      "Revise a minuta abaixo como advogado sênior: aponte inconsistências, lacunas, pedidos faltantes e trechos que " +
      "precisam de fundamentação verificada. Responda em tópicos curtos. Não reescreva a peça inteira.\n\n" +
      `MINUTA:\n${(currentText ?? "").slice(0, 60_000)}`
    );
  }
  return (
    "Reescreva o trecho abaixo em linguagem jurídica formal e clara, mantendo o sentido e sem acrescentar fundamentos " +
    `não informados. Responda somente com o trecho reescrito.\n\nTRECHO:\n${selection ?? ""}`
  );
}

export async function POST(request: Request) {
  const auth = await apiRequireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user, profile } = auth.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Requisição inválida.");
  const { petitionId, action, selection, currentText } = parsed.data;
  if (action === "rewrite" && !selection?.trim()) return jsonError(400, "Selecione um trecho no editor.");

  const { data: petition } = await supabase
    .from("petitions")
    .select("form,foundations")
    .eq("id", petitionId)
    .maybeSingle<PetitionRow>();
  if (!petition) return jsonError(404, "Petição não encontrada.");

  const settings = await loadAllSettings();
  if (!settings) {
    const err = aiError("not_configured");
    return jsonError(503, err.ok ? "" : err.message, { code: "not_configured" });
  }
  const access = await loadAccess(supabase, user.id, profile?.created_at ?? user.created_at, settings.trial.days);
  const usage = await loadUsage(supabase, user.id);
  const blocked = checkAiAllowed({ feature: "petitions", settings, access, usage });
  if (blocked) return jsonError(403, blocked, { code: "blocked" });

  const result = await generate({
    config: settings.ai_model,
    instructions: (await activePrompt()) ?? undefined,
    input: [{ role: "user", content: [{ type: "input_text", text: buildPrompt(action, petition, selection, currentText) }] }],
  });
  if (!result.ok) return jsonError(503, result.message, { code: result.code });

  await recordUsage({
    user_id: user.id,
    feature: action === "generate" ? "petition_generate" : `petition_${action}`,
    model: result.model,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
  });
  return NextResponse.json({ text: result.text });
}
