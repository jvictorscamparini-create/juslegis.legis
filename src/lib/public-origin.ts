import type { NextRequest } from "next/server";

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i;
const VALID_HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(:\d{1,5})?$/i;

/**
 * Origem pública do site (ex.: https://juslegis.com.br), usada nos redirecionamentos.
 *
 * Ordem de confiança:
 * 1. NEXT_PUBLIC_SITE_URL / NEXT_PUBLIC_APP_URL, quando definidas — valor do servidor, nunca do cliente.
 * 2. x-forwarded-host / x-forwarded-proto (proxy reverso da Hostinger ou prévias da Vercel), validados.
 * 3. A origem da própria requisição.
 *
 * Preferir a variável configurada impede que um cabeçalho forjado leve o usuário a outro domínio.
 */
export function publicOrigin(request: NextRequest | Request): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      // Valor inválido: segue para as outras fontes.
    }
  }

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? "";
  if (forwardedHost && VALID_HOST.test(forwardedHost) && !LOCAL_HOST.test(forwardedHost)) {
    const rawProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
    const proto = rawProto === "http" || rawProto === "https" ? rawProto : "https";
    return `${proto}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}
