import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRequireAdmin, jsonError } from "@/lib/auth";
import { addCustomIntegration, removeCustomIntegration } from "@/lib/custom-integrations";

const postSchema = z.object({
  name: z.string().trim().min(2).max(80),
  base_url: z.string().trim().max(300).refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }),
  notes: z.string().trim().max(300).default(""),
  key: z.union([z.literal(""), z.string().trim().min(8).max(600).regex(/^\S+$/)]).default(""),
});
const deleteSchema = z.object({ id: z.string().uuid() });

/** Cadastra uma API. Somente Administrador Geral; a chave nunca é registrada nem devolvida. */
export async function POST(request: Request) {
  const auth = await apiRequireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth.ctx;

  const body = postSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "Confira os dados: o nome é obrigatório, o endereço precisa começar com https:// e a chave não pode ter espaços.");

  const saved = await addCustomIntegration(body.data, user.id);
  if (!saved.ok) return jsonError(500, saved.message);

  await supabase.from("admin_audit_log").insert({ actor_id: user.id, action: "custom_integration.create", target: body.data.name, before: null, after: { base_url: body.data.base_url, has_key: !!body.data.key } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await apiRequireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth.ctx;

  const body = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "API inválida.");
  if (!(await removeCustomIntegration(body.data.id))) return jsonError(500, "Não foi possível remover a API.");

  await supabase.from("admin_audit_log").insert({ actor_id: user.id, action: "custom_integration.delete", target: body.data.id, before: null, after: null });
  return NextResponse.json({ ok: true });
}
