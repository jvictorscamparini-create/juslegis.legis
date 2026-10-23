import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRequireAdmin, jsonError } from "@/lib/auth";
import { isSettingKey, mergeSettings, parseSetting } from "@/lib/settings";

const bodySchema = z.object({ key: z.string(), value: z.unknown() });

export async function GET() {
  const auth = await apiRequireAdmin();
  if (!auth.ok) return auth.response;
  const { data, error } = await auth.ctx.supabase.from("admin_settings").select("key,value");
  if (error) return jsonError(500, "Não foi possível ler as configurações.");
  return NextResponse.json({ settings: mergeSettings(data) });
}

/** Grava uma chave de configuração. Validação no servidor, RLS de admin no banco e registro no log. */
export async function PUT(request: Request) {
  const auth = await apiRequireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth.ctx;

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success || !isSettingKey(body.data.key)) return jsonError(400, "Configuração desconhecida.");
  const key = body.data.key;

  const { data: current } = await supabase.from("admin_settings").select("value").eq("key", key).maybeSingle();
  let value = body.data.value;
  // O ID do plano no Mercado Pago só é alterado pela sincronização, nunca pelo formulário.
  if (key === "plan" && value && typeof value === "object") {
    value = { ...value, mp_plan_id: (current?.value as { mp_plan_id?: string | null } | undefined)?.mp_plan_id ?? null };
  }
  const parsed = parseSetting(key, value);
  if (!parsed.success) {
    return jsonError(422, "Valores inválidos.", { issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
  }

  const { error } = await supabase
    .from("admin_settings")
    .upsert({ key, value: parsed.data, updated_at: new Date().toISOString(), updated_by: user.id });
  if (error) return jsonError(500, "Não foi possível gravar a configuração.");

  await supabase.from("admin_audit_log").insert({
    actor_id: user.id,
    action: "settings.update",
    target: key,
    before: current?.value ?? null,
    after: parsed.data,
  });
  return NextResponse.json({ ok: true, value: parsed.data });
}
