import { NextResponse } from "next/server";
import { mpEnvironment, mpWebhookSecret } from "@/lib/env";
import {
  mpRequest,
  normalizeSubscriptionStatus,
  verifyWebhookSignature,
  type MpPayment,
  type MpPreapproval,
} from "@/lib/mercadopago";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Webhook do Mercado Pago.
 * Regras: assinatura validada no servidor, idempotência por evento, status sempre reconsultado na API
 * (o corpo do evento nunca é usado para liberar acesso) e registro de todos os eventos aceitos.
 */
export async function POST(request: Request) {
  const secret = mpWebhookSecret();
  const admin = createAdminClient();
  if (!secret || !admin) return NextResponse.json({ error: "Webhook não configurado." }, { status: 503 });

  const url = new URL(request.url);
  const payload = (await request.json().catch(() => ({}))) as { type?: string; action?: string; data?: { id?: string | number } };
  const dataId = url.searchParams.get("data.id") ?? (payload.data?.id != null ? String(payload.data.id) : null);
  const type = url.searchParams.get("type") ?? payload.type ?? null;
  const requestId = request.headers.get("x-request-id");

  const valid = verifyWebhookSignature({
    secret,
    signatureHeader: request.headers.get("x-signature"),
    requestId,
    dataId,
  });
  if (!valid) return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  if (!dataId || !type) return NextResponse.json({ ok: true, ignored: "evento sem identificador" });

  const eventKey = requestId ?? `${type}:${dataId}:${payload.action ?? ""}`;
  const { data: event, error: dup } = await admin
    .from("webhook_events")
    .insert({ provider: "mercadopago", event_key: eventKey, type, signature_valid: true, payload })
    .select("id")
    .single();
  if (dup) return NextResponse.json({ ok: true, duplicate: true });

  const env = mpEnvironment();
  let result = "ignorado";

  if (type === "subscription_preapproval") {
    const res = await mpRequest<MpPreapproval>(env, `/preapproval/${encodeURIComponent(dataId)}`);
    if (res.ok && res.data.external_reference) {
      await admin.from("subscriptions").upsert(
        {
          user_id: res.data.external_reference,
          mp_preapproval_id: res.data.id,
          status: normalizeSubscriptionStatus(res.data.status),
          environment: env,
          next_payment_date: res.data.next_payment_date ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "mp_preapproval_id" },
      );
      result = `assinatura ${res.data.status}`;
    } else {
      result = res.ok ? "assinatura sem referência de usuário" : `falha ao consultar: ${res.message}`;
    }
  } else if (type === "payment") {
    const res = await mpRequest<MpPayment>(env, `/v1/payments/${encodeURIComponent(dataId)}`);
    if (res.ok) {
      await admin.from("payments").upsert(
        {
          mp_payment_id: String(res.data.id),
          user_id: res.data.external_reference ?? res.data.metadata?.user_id ?? null,
          amount: res.data.transaction_amount ?? null,
          status: res.data.status,
          environment: env,
        },
        { onConflict: "mp_payment_id" },
      );
      result = `pagamento ${res.data.status}`;
    } else {
      result = `falha ao consultar: ${res.message}`;
    }
  }

  await admin.from("webhook_events").update({ result }).eq("id", event.id);
  return NextResponse.json({ ok: true });
}
