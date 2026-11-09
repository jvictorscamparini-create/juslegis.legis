import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublicConfig } from "@/lib/env";
import { isPasswordRecoveryPath } from "@/lib/auth-flow";
import { relativeRedirect } from "@/lib/relative-redirect";
import { postLoginPath } from "@/lib/safe-redirect";

const PROTECTED = ["/app", "/admin"];

/**
 * Renova a sessão do Supabase e faz a checagem otimista de login.
 * A autorização definitiva (admin, dono do dado) é feita nos layouts, nas rotas de API e no RLS.
 */
export async function updateSession(request: NextRequest) {
  const cfg = supabasePublicConfig();
  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED.some((p) => path === p || path.startsWith(p + "/"));

  if (!cfg) {
    if (isProtected) return relativeRedirect("/login?erro=config", 307);
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(cfg.url, cfg.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redireciona preservando os cookies que o Supabase acabou de renovar (ou limpar).
  const redirectKeepingSession = (destination: string) => {
    const redirect = relativeRedirect(destination, 307);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  if (!user && isProtected) {
    const requested = `${path}${request.nextUrl.search}`;
    return redirectKeepingSession(`/login?next=${encodeURIComponent(requested)}`);
  }
  if (user && path === "/login" && !isPasswordRecoveryPath(path, request.nextUrl.searchParams)) {
    return redirectKeepingSession(postLoginPath(request.nextUrl.searchParams.get("next")));
  }
  return response;
}
