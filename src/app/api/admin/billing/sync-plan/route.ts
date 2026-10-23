import { NextResponse } from "next/server";
import { apiRequireAdmin, jsonError } from "@/lib/auth";
import { isBillingEnabled, mpEnvironment, siteUrl } from "@/lib/env";
import { mpRequest } from "@/lib/mercadopago";
import { mergeSettings } from "@/lib/settings";

/** Cria (ou atualiza) o plano mensal padrão no Mercado Pago. Bloqueado enquanto BILLING_ENABLED != "true". */
export async function POST() {
  const auth = await apiRequireAdmin();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth.ctx;

  if (!isBillingEnabled()) {
    return jsonError(409, "Cobranças desativadas no servidor (BILLING_ENABLED). Nada foi enviado ao Mercado Pago.");
  }
  const { data } = await supabase.from("admin_settings").select("key,value");
  const settings = mergeSettings(data);
  const plan = settings.plan;
  if (!plan.price_brl) return jsonError(422, "Defina o valor mensal do plano antes de sincronizar.");

  const env = mpEnvironment();
  const body = {
    reason: "JusLegis — Assinatura mensal",
    auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: plan.price_brl, currency_id: "BRL" },
    back_url: `${siteUrl()}/app/assinatura`,
  };
  const res = plan.mp_plan_id
    ? await mpRequest<{ id: string }>(env, `/preapproval_plan/${plan.mp_plan_id}`, { method: "PUT", body })
    : await mpRequest<{ id: string }>(env, "/preapproval_plan", { method: "POST", body });
  if (!res.ok) return jsonError(502, `Mercado Pago recusou a sincronização: ${res.message}`);

  const next = { ...plan, mp_plan_id: res.data.id };
  await supabase.from("admin_settings").upsert({ key: "plan", value: next, updated_at: new Date().toISOString(), updated_by: user.id });
  await supabase.from("admin_audit_log").insert({
    actor_id: user.id,
    action: "billing.sync_plan",
    target: env,
    before: { mp_plan_id: plan.mp_plan_id },
    after: { mp_plan_id: res.data.id, price_brl: plan.price_brl },
  });
  return NextResponse.json({ ok: true, mpPlanId: res.data.id, environment: env });
}
