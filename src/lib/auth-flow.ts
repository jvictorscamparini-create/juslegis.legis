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
