import { NextResponse } from "next/server";
import { apiRequireAdmin, jsonError } from "@/lib/auth";
import { isService, runCheck } from "@/lib/connection-tests";
import { mergeSettings } from "@/lib/settings";

export async function POST(_request: Request, { params }: { params: Promise<{ service: string }> }) {
  const auth = await apiRequireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth.ctx;

  const { service } = await params;
  if (!isService(service)) return jsonError(404, "Serviço desconhecido.");

  const { data } = await supabase.from("admin_settings").select("key,value");
  const settings = mergeSettings(data);
  const result = await runCheck(service, settings.ai_model.model);
  const checkedAt = new Date().toISOString();

  await supabase.from("integration_checks").insert({ service, ok: result.ok, detail: result.detail, checked_by: user.id });
  return NextResponse.json({ service, ...result, checkedAt });
}
