import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRequireAdmin, jsonError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({ id: z.uuid(), status: z.enum(["active", "blocked"]) });

/** Bloqueia/reativa uma conta. Escrita com service role porque o papel authenticated não altera profiles.status. */
export async function PATCH(request: Request) {
  const auth = await apiRequireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth.ctx;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "Requisição inválida.");
  if (body.data.id === user.id) return jsonError(400, "Você não pode alterar a própria conta.");

  const admin = createAdminClient();
  if (!admin) return jsonError(503, "Service role não configurada no servidor.");
  const { data: target } = await admin.from("profiles").select("role,status").eq("id", body.data.id).maybeSingle();
  if (!target) return jsonError(404, "Usuário não encontrado.");
  if (target.role === "admin") return jsonError(403, "Contas administrativas não podem ser bloqueadas por aqui.");

  const { error } = await admin.from("profiles").update({ status: body.data.status }).eq("id", body.data.id);
  if (error) return jsonError(500, "Falha ao atualizar.");
  await supabase.from("admin_audit_log").insert({ actor_id: user.id, action: "user.status", target: body.data.id, before: { status: target.status }, after: { status: body.data.status } });
  return NextResponse.json({ ok: true });
}
