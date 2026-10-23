import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRequireAdmin, jsonError } from "@/lib/auth";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(20_000),
  active: z.boolean().default(false),
});

/** Cria uma nova versão de prompt de sistema. Versões anteriores são mantidas para histórico. */
export async function POST(request: Request) {
  const auth = await apiRequireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth.ctx;

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "Informe nome e conteúdo do prompt.");
  const { name, content, active } = body.data;

  const { data: last } = await supabase
    .from("ai_prompts")
    .select("version")
    .eq("name", name)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<{ version: number }>();
  const version = (last?.version ?? 0) + 1;

  if (active) await supabase.from("ai_prompts").update({ active: false }).eq("active", true);
  const { data, error } = await supabase
    .from("ai_prompts")
    .insert({ name, content, version, active, created_by: user.id })
    .select("id,name,version,active,created_at")
    .single();
  if (error) return jsonError(500, "Não foi possível salvar o prompt.");

  await supabase.from("admin_audit_log").insert({
    actor_id: user.id,
    action: "prompt.create",
    target: `${name} v${version}`,
    after: { name, version, active },
  });
  return NextResponse.json({ prompt: data });
}
