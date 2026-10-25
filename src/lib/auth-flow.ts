export function passwordSignInError(status: number | undefined) {
  return status === 429
    ? "Muitas tentativas. Aguarde alguns instantes e tente de novo."
    : "E-mail ou senha incorretos.";
}

export function passwordRecoveryRedirect(origin: string) {
  const destination = new URL("/auth/callback", origin);
  destination.searchParams.set("next", "/login?recovery=1");
  return destination.toString();
}

const EMAIL_OTP_TYPES = ["signup", "invite", "magiclink", "recovery", "email_change", "email"] as const;

/** Tipo de link de e-mail aceito pelo callback; qualquer outro valor é recusado. */
export function emailOtpType(value: string | null) {
  return (EMAIL_OTP_TYPES as readonly string[]).includes(value ?? "") ? (value as (typeof EMAIL_OTP_TYPES)[number]) : null;
}

export function isPasswordRecoveryPath(pathname: string, searchParams: URLSearchParams) {
  return pathname === "/login" && searchParams.get("recovery") === "1";
}
