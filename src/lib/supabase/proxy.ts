import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublicConfig } from "@/lib/env";
import { isPasswordRecoveryPath } from "@/lib/auth-flow";
import { publicOrigin } from "@/lib/public-origin";

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
    if (isProtected) return NextResponse.redirect(new URL("/login?erro=config", publicOrigin(request)));
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

  if (!user && isProtected) {
    const url = new URL("/login", publicOrigin(request));
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  if (user && path === "/login" && !isPasswordRecoveryPath(path, request.nextUrl.searchParams)) {
    return NextResponse.redirect(new URL("/app", publicOrigin(request)));
  }
  return response;
}
