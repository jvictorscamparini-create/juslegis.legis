import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRequireAdmin, jsonError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Limite mensal de IA de um usuário específico. Só o Administrador Geral grava (service role, após apiRequireAdmin).
// Ambos os campos nulos = remover o limite individual (o usuário volta a seguir o limite geral).

const bodySchema = z.object({
  userId: z.uuid(),
  tokens_month: z.number().int().positive().max(1_000_000_000).nullable(),
  cost_month_brl: z.number().nonnegative().max(1_000_000).nullable(),
  note: z.string().trim().max(500).nullable().optional(),
});

export async function PUT(request: Request) {
  const auth = await apiRequireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth.ctx;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "Valores inválidos.");

  const admin = createAdminClient();
  if (!admin) return jsonError(503, "Service role não configurada no servidor.");
  const { userId, tokens_month, cost_month_brl } = body.data;
  const note = body.data.note || null;

  const { data: target } = await admin.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (!target) return jsonError(404, "Usuário não encontrado.");
  const { data: before } = await admin.from("user_limits").select("tokens_month,cost_month_brl,note").eq("user_id", userId).maybeSingle();

  if (tokens_month == null && cost_month_brl == null) {
    const { error } = await admin.from("user_limits").delete().eq("user_id", userId);
    if (error) return jsonError(500, "Não foi possível remover o limite.");
  } else {
    const { error } = await admin
      .from("user_limits")
      .upsert({ user_id: userId, tokens_month, cost_month_brl, note, updated_by: user.id, updated_at: new Date().toISOString() });
    if (error) return jsonError(500, "Não foi possível gravar o limite.");
  }

  await supabase.from("admin_audit_log").insert({
    actor_id: user.id,
    action: "user.ai_limit",
    target: userId,
    before: before ?? null,
    after: tokens_month == null && cost_month_brl == null ? null : { tokens_month, cost_month_brl, note },
  });
  return NextResponse.json({ ok: true });
}
