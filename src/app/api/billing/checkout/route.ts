import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { apiRequireUser, jsonError } from "@/lib/auth";
import { isBillingEnabled, mpEnvironment, siteUrl } from "@/lib/env";
import { mpRequest, type MpPreapproval } from "@/lib/mercadopago";
import { loadAllSettings } from "@/lib/runtime";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Inicia a assinatura mensal no checkout do Mercado Pago.
 * O acesso só é liberado quando o webhook confirmar o status "authorized" consultando a API.
 */
export async function POST() {
  const auth = await apiRequireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth.ctx;

  if (!isBillingEnabled()) {
    return jsonError(503, "O checkout seguro do Mercado Pago ainda não está habilitado. Nenhuma cobrança foi iniciada.");
  }
  const settings = await loadAllSettings();
  const admin = createAdminClient();
  if (!settings || !admin) return jsonError(503, "Servidor sem configuração completa. Nenhuma cobrança foi iniciada.");
  const plan = settings.plan;
  if (!plan.available || !plan.price_brl) return jsonError(409, "O plano ainda não está disponível para novas assinaturas.");

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("user_id", user.id)
    .eq("status", "authorized")
    .maybeSingle();
  if (existing) return jsonError(409, "Você já possui uma assinatura ativa.");

  const env = mpEnvironment();
  const res = await mpRequest<MpPreapproval>(env, "/preapproval", {
    method: "POST",
    idempotencyKey: randomUUID(),
    body: {
      reason: "JusLegis — Assinatura mensal",
      external_reference: user.id,
      payer_email: user.email,
      auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: plan.price_brl, currency_id: "BRL" },
      back_url: `${siteUrl()}/app/assinatura`,
      status: "pending",
    },
  });
  if (!res.ok || !res.data.init_point) {
    return jsonError(502, "O Mercado Pago não criou o checkout. Nenhuma cobrança foi iniciada.");
  }

  await admin.from("subscriptions").upsert(
    { user_id: user.id, mp_preapproval_id: res.data.id, status: "pending", environment: env, updated_at: new Date().toISOString() },
    { onConflict: "mp_preapproval_id" },
  );
  return NextResponse.json({ url: res.data.init_point });
}
