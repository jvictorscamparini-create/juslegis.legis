import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRequireAdmin, jsonError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Tabela de preços dos modelos (base do cálculo de custo). Versionada: um preço novo cria uma linha com
// nova vigência, e as chamadas antigas continuam ligadas ao preço que valia quando foram feitas.

const bodySchema = z.object({
  model: z.string().trim().min(1).max(100),
  input_per_mtok_usd: z.number().nonnegative().max(10_000),
  cached_input_per_mtok_usd: z.number().nonnegative().max(10_000).nullable(),
  output_per_mtok_usd: z.number().nonnegative().max(10_000),
  notes: z.string().trim().max(300).nullable().optional(),
});

export async function POST(request: Request) {
  const auth = await apiRequireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth.ctx;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "Valores inválidos.");

  const admin = createAdminClient();
  if (!admin) return jsonError(503, "Service role não configurada no servidor.");
  const row = { ...body.data, notes: body.data.notes || null, created_by: user.id, effective_from: new Date().toISOString() };
  const { error } = await admin.from("ai_model_prices").insert(row);
  if (error) return jsonError(500, "Não foi possível gravar o preço.");

  await supabase.from("admin_audit_log").insert({ actor_id: user.id, action: "ai.price", target: body.data.model, before: null, after: row });
  return NextResponse.json({ ok: true });
}
