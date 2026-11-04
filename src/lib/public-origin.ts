import type { NextRequest } from "next/server";

/**
 * Origem pública do site (ex.: https://juslegis.com.br).
 *
 * Na Hostinger o Node.js roda atrás de um proxy reverso: request.url pode trazer um host
 * interno (localhost:3000). Usa os cabeçalhos repassados pelo proxy e, sem eles, a
 * NEXT_PUBLIC_SITE_URL; só por último a origem da própria requisição.
 */
export function publicOrigin(request: NextRequest | Request): string {
  const headers = request.headers;
  const forwardedHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (forwardedHost && !/^(localhost|127\.|0\.0\.0\.0)/.test(forwardedHost)) {
    const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    return `${proto}://${forwardedHost}`;
  }
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const own = new URL(request.url).origin;
  if (configured && /\/\/(localhost|127\.|0\.0\.0\.0)/.test(own)) return configured;
  return own;
}
