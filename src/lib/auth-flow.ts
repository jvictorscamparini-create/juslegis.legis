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
 * Estado real do provedor no Supabase Auth (endpoint público /auth/v1/settings, só a chave pública).
 * true/false quando o Supabase respondeu; null quando não foi possível saber (rede, timeout, erro HTTP).
 */
export async function oauthProviderStatus(provider: "google", fetcher: typeof fetch = fetch, timeoutMs = 4000): Promise<boolean | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return false;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetcher(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      signal: controller?.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const settings = (await res.json()) as { external?: Record<string, boolean> };
    return settings.external?.[provider] === true;
  } catch {
    return null;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Consulta as configurações públicas do Supabase Auth (só a chave pública).
 * Em falha de rede ou timeout devolve true para não bloquear um provedor que pode estar ativo.
 */
export async function isOAuthProviderEnabled(provider: "google", fetcher: typeof fetch = fetch, timeoutMs = 4000) {
  return (await oauthProviderStatus(provider, fetcher, timeoutMs)) !== false;
}

export class AuthTimeoutError extends Error {
  constructor() {
    super("auth_timeout");
    this.name = "AuthTimeoutError";
  }
}

/** Limite de espera para chamadas ao Supabase Auth: evita botão girando para sempre numa rede ruim. */
export function withTimeout<P extends PromiseLike<unknown>>(promise: P, ms = 15000): Promise<Awaited<P>> {
  return new Promise<Awaited<P>>((resolve, reject) => {
    const timer = setTimeout(() => reject(new AuthTimeoutError()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value as Awaited<P>);
      },
      (reason: unknown) => {
        clearTimeout(timer);
        reject(reason);
      },
    );
  });
}

/** Mensagem para exceções de rede/timeout (não para erros de credencial, que vêm no `error` do Supabase). */
export function networkErrorMessage(error: unknown) {
  if (error instanceof AuthTimeoutError) return "O serviço de autenticação demorou para responder. Verifique sua conexão e tente novamente.";
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "Sem conexão com a internet. Verifique sua rede e tente novamente.";
  return "Não foi possível conectar ao serviço de autenticação. Verifique sua conexão e tente novamente.";
}

const EMAIL_OTP_TYPES = ["signup", "invite", "magiclink", "recovery", "email_change", "email"] as const;

/** Tipo de link de e-mail aceito pelo callback; qualquer outro valor é recusado. */
export function emailOtpType(value: string | null) {
  return (EMAIL_OTP_TYPES as readonly string[]).includes(value ?? "") ? (value as (typeof EMAIL_OTP_TYPES)[number]) : null;
}

export function isPasswordRecoveryPath(pathname: string, searchParams: URLSearchParams) {
  return pathname === "/login" && searchParams.get("recovery") === "1";
}
