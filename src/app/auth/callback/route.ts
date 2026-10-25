import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/safe-redirect";
import { emailOtpType } from "@/lib/auth-flow";

// Retorno do Supabase Auth: Google e links PKCE (?code=) e links de e-mail com token_hash
// (confirmação de cadastro, magic link e recuperação de senha, conforme o template do projeto).
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const otpType = emailOtpType(url.searchParams.get("type"));
  const safeNext = safeInternalPath(url.searchParams.get("next"));
  const fail = () => NextResponse.redirect(new URL("/login?erro=oauth", url.origin));

  const supabase = await createClient();
  if (!supabase) return fail();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail();
  } else if (tokenHash && otpType) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType });
    if (error) return fail();
    if (otpType === "recovery") return NextResponse.redirect(new URL("/login?recovery=1", url.origin));
  } else {
    return fail();
  }
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
