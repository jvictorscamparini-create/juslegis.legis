import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { postLoginPath } from "@/lib/safe-redirect";
import { emailOtpType } from "@/lib/auth-flow";
import { relativeRedirect } from "@/lib/relative-redirect";

// Retorno do Supabase Auth: Google e links PKCE (?code=) e links de e-mail com token_hash
// (confirmação de cadastro, magic link e recuperação de senha, conforme o template do projeto).
// Os cookies de sessão gravados pelo cliente do servidor seguem junto com a resposta de redirecionamento.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const otpType = emailOtpType(url.searchParams.get("type"));
  // Recuperação de senha volta para /login?recovery=1; os demais destinos não podem ser /login nem /auth.
  const rawNext = url.searchParams.get("next");
  const safeNext = rawNext === "/login?recovery=1" ? rawNext : postLoginPath(rawNext);
  const providerError = url.searchParams.get("error") || url.searchParams.get("error_code");
  const fail = () => relativeRedirect("/login?erro=oauth");

  // O Supabase devolve ?error=... quando o usuário cancela o Google ou o provedor falha.
  if (providerError) return fail();

  const supabase = await createClient();
  if (!supabase) return relativeRedirect("/login?erro=config");

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail();
  } else if (tokenHash && otpType) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType });
    if (error) return fail();
    if (otpType === "recovery") return relativeRedirect("/login?recovery=1");
  } else {
    return fail();
  }
  return relativeRedirect(safeNext);
}
