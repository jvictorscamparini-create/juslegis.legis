import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Retorno do login com Google (fluxo PKCE do Supabase Auth).
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/app";

  const supabase = await createClient();
  if (!supabase || !code) return NextResponse.redirect(new URL("/login?erro=oauth", url.origin));

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?erro=oauth", url.origin));
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
