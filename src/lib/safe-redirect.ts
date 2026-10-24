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
