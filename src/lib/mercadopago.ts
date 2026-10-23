import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mpAccessToken, type MpEnvironment } from "@/lib/env";

// Mercado Pago PJ — API de Assinaturas (preapproval). Nenhuma cobrança é criada sem a trava BILLING_ENABLED.

const API = "https://api.mercadopago.com";

export type MpResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

export async function mpRequest<T>(
  env: MpEnvironment,
  path: string,
  init: { method?: "GET" | "POST" | "PUT"; body?: unknown; idempotencyKey?: string } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<MpResult<T>> {
  const token = mpAccessToken(env);
  if (!token) {
    const label = env === "prod" ? "produção" : "teste";
    return { ok: false, status: 0, message: `Credencial do Mercado Pago (${label}) não definida no servidor.` };
  }
  try {
    const res = await fetchImpl(API + path, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.idempotencyKey ? { "X-Idempotency-Key": init.idempotencyKey } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => ({}))) as T & { message?: string };
    if (!res.ok) return { ok: false, status: res.status, message: data?.message || `HTTP ${res.status}` };
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0, message: "Não foi possível contatar o Mercado Pago." };
  }
}

/**
 * Valida o cabeçalho x-signature dos webhooks.
 * Manifesto oficial: `id:{data.id};request-id:{x-request-id};ts:{ts};` assinado com HMAC-SHA256.
 */
export function verifyWebhookSignature(params: {
  secret: string;
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string | null;
  toleranceSeconds?: number;
  now?: number;
}): boolean {
  const { secret, signatureHeader, requestId, dataId } = params;
  if (!secret || !signatureHeader) return false;
  const parts: Record<string, string> = {};
  for (const piece of signatureHeader.split(",")) {
    const [k, ...v] = piece.trim().split("=");
    if (k) parts[k] = v.join("=");
  }
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1 || !/^[0-9a-f]+$/i.test(v1)) return false;

  if (params.toleranceSeconds) {
    const tsMs = ts.length > 10 ? Number(ts) : Number(ts) * 1000;
    const now = params.now ?? Date.now();
    if (!Number.isFinite(tsMs) || Math.abs(now - tsMs) > params.toleranceSeconds * 1000) return false;
  }

  let manifest = "";
  if (dataId) manifest += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;

  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type MpPreapproval = {
  id: string;
  status: string;
  external_reference?: string | null;
  next_payment_date?: string | null;
  init_point?: string;
};

export type MpPayment = {
  id: number | string;
  status: string;
  transaction_amount?: number;
  external_reference?: string | null;
  metadata?: { user_id?: string } | null;
};

export function normalizeSubscriptionStatus(status: string): "pending" | "authorized" | "paused" | "cancelled" {
  if (status === "authorized" || status === "paused" || status === "cancelled") return status;
  return "pending";
}
