const REDIRECT_ORIGIN = "https://juslegis.invalid";

export function safeInternalPath(value: string | null | undefined, fallback = "/app") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  try {
    const destination = new URL(value, REDIRECT_ORIGIN);
    if (destination.origin !== REDIRECT_ORIGIN) return fallback;
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return fallback;
  }
}

/**
 * Destino depois do login: caminho interno, mas nunca a própria tela de login nem rotas de /auth,
 * que levariam a um laço de redirecionamento.
 */
export function postLoginPath(value: string | null | undefined, fallback = "/app") {
  const path = safeInternalPath(value, fallback);
  const pathname = path.split(/[?#]/)[0];
  if (pathname === "/login" || pathname.startsWith("/login/") || pathname === "/auth" || pathname.startsWith("/auth/")) return fallback;
  return path;
}
