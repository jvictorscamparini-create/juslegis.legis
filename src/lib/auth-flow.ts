export function passwordSignInError(status: number | undefined) {
  return status === 429
    ? "Muitas tentativas. Aguarde alguns instantes e tente de novo."
    : "E-mail ou senha incorretos.";
}

export const MIN_PASSWORD_LENGTH = 8;

export function signUpError(error: { status?: number; code?: string; message?: string }) {
  if (error.status === 429 || error.code === "over_email_send_rate_limit") {
    return "Muitas tentativas. Aguarde alguns instantes e tente de novo.";
  }
  if (error.code === "user_already_exists" || /already registered/i.test(error.message ?? "")) {
    return "Já existe uma conta com este e-mail. Use “Entrar” ou “Esqueci minha senha”.";
  }
  if (error.code === "weak_password") {
    return `Escolha uma senha mais forte, com pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  return "Não foi possível criar a conta agora. Tente novamente em instantes.";
}

export function passwordRecoveryRedirect(origin: string) {
  const destination = new URL("/auth/callback", origin);
  destination.searchParams.set("next", "/login?recovery=1");
  return destination.toString();
}

/**
 * Consulta as configurações públicas do Supabase Auth (só a chave pública).
 * Em falha de rede devolve true para não bloquear um provedor que pode estar ativo.
 */
export async function isOAuthProviderEnabled(provider: "google", fetcher: typeof fetch = fetch) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return false;
  try {
    const res = await fetcher(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    if (!res.ok) return true;
    const settings = (await res.json()) as { external?: Record<string, boolean> };
    return settings.external?.[provider] === true;
  } catch {
    return true;
  }
}

const EMAIL_OTP_TYPES = ["signup", "invite", "magiclink", "recovery", "email_change", "email"] as const;

/** Tipo de link de e-mail aceito pelo callback; qualquer outro valor é recusado. */
export function emailOtpType(value: string | null) {
  return (EMAIL_OTP_TYPES as readonly string[]).includes(value ?? "") ? (value as (typeof EMAIL_OTP_TYPES)[number]) : null;
}

export function isPasswordRecoveryPath(pathname: string, searchParams: URLSearchParams) {
  return pathname === "/login" && searchParams.get("recovery") === "1";
}
