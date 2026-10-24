import { NextResponse } from "next/server";
import { apiRequireUser, jsonError } from "@/lib/auth";
import { mpEnvironment } from "@/lib/env";
import { mpRequest, type MpPreapproval } from "@/lib/mercadopago";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const auth = await apiRequireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth.ctx;

  if (mpEnvironment() !== "test") {
    return jsonError(503, "O cancelamento automático está limitado a assinaturas de teste.");
  }
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("mp_preapproval_id,environment,status")
    .eq("user_id", user.id)
    .eq("status", "authorized")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ mp_preapproval_id: string | null; environment: string; status: string }>();
  if (!subscription?.mp_preapproval_id) return jsonError(404, "Nenhuma assinatura ativa foi encontrada.");
  if (subscription.environment !== "test") return jsonError(409, "A assinatura não pertence ao ambiente de teste.");

  const result = await mpRequest<MpPreapproval>("test", `/preapproval/${encodeURIComponent(subscription.mp_preapproval_id)}`, {
    method: "PUT",
    body: { status: "cancelled" },
  });
  if (!result.ok) return jsonError(502, "Não foi possível confirmar o cancelamento no Mercado Pago.");
  if (result.data.status !== "cancelled") return jsonError(502, "O Mercado Pago não confirmou o cancelamento.");

  const admin = createAdminClient();
  if (!admin) return jsonError(503, "Cancelamento confirmado, mas não foi possível atualizar o registro local.");
  const { error } = await admin
    .from("subscriptions")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("mp_preapproval_id", subscription.mp_preapproval_id)
    .eq("user_id", user.id)
    .eq("environment", "test");
  if (error) return jsonError(503, "Cancelamento confirmado, mas não foi possível atualizar o registro local.");
  return NextResponse.json({ ok: true });
}
