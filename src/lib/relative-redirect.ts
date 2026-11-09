import { NextResponse } from "next/server";
import { safeInternalPath } from "@/lib/safe-redirect";

/**
 * Redirecionamento com `Location` relativo ("/login", "/app"...).
 *
 * Atrás de proxy (AI Studio/Cloud Run, Hostinger) o `request.url` traz o endereço interno
 * (ex.: 0.0.0.0:3000). Com caminho relativo o navegador resolve contra o domínio que ele mesmo
 * está acessando, sem confiar em cabeçalhos X-Forwarded-* e sem fixar domínio de ambiente.
 * O destino passa por safeInternalPath, então nunca aponta para fora do site.
 */
export function relativeRedirect(path: string, status: 303 | 307 = 303, fallback = "/app") {
  const response = new NextResponse(null, { status });
  response.headers.set("Location", safeInternalPath(path, fallback));
  return response;
}
