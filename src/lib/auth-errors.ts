type AuthErrorInfo = {
  code?: string;
  status?: number;
  message?: string;
};

export function authConfigurationError(error: AuthErrorInfo, method: "google" | "email") {
  const code = error.code?.toLowerCase() ?? "";
  const message = error.message?.toLowerCase() ?? "";

  if (error.status === 429 || code === "over_request_rate_limit" || code === "too_many_requests") {
    return "Muitas tentativas. Aguarde alguns instantes e tente novamente.";
  }

  if (method === "google" && (code === "provider_disabled" || /provider is not enabled|provider.*disabled/.test(message))) {
    return "Login com Google ainda não está disponível. Entre com seu e-mail: use “Criar conta” ou “Entrar com código”.";
  }

  if (
    method === "email" &&
    (code === "otp_disabled" || /signups not allowed for otp|otp.*disabled|email provider.*disabled/.test(message))
  ) {
    return "Cadastro por código de e-mail indisponível: habilite Email/OTP em Supabase → Authentication → Providers.";
  }

  if (code === "signup_disabled" || /signups not allowed/.test(message)) {
    return "Novos cadastros estão desabilitados no Supabase. Habilite signups para o beta autorizado.";
  }

  if (code === "email_not_confirmed" || /email not confirmed/.test(message)) {
    return "Confirme seu e-mail antes de entrar ou solicite um novo código.";
  }

  if (code === "invalid_credentials" || /invalid login credentials|invalid email or password/.test(message)) {
    return "E-mail ou senha incorretos.";
  }

  if (code === "redirect_uri_mismatch" || /redirect.*(not allowed|allow list|mismatch)/.test(message)) {
    return "Callback não autorizado. Adicione a URL atual em Supabase → Authentication → URL Configuration → Redirect URLs.";
  }

  return method === "google"
    ? "Não foi possível iniciar o login Google. Verifique provedor e credenciais OAuth no Supabase."
    : "Não foi possível concluir a autenticação por e-mail. Verifique o provedor Email/OTP no Supabase.";
}
