// Endereço público do site para montar redirecionamentos.
// Atrás de proxy (Hostinger, Nginx, etc.) o `request.url` do Next traz o endereço interno
// (localhost:PORTA), então o domínio real vem dos cabeçalhos que o proxy repassa.

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/;
const VALID_HOST = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$|^\[::1\](:\d+)?$/;

function first(value: string | null) {
  return (value ?? "").split(",")[0].trim().toLowerCase();
}

export function publicOrigin(request: Request): string {
  const host = first(request.headers.get("x-forwarded-host")) || first(request.headers.get("host"));
  const proto = first(request.headers.get("x-forwarded-proto"));

  if (host && VALID_HOST.test(host) && !LOCAL_HOST.test(host)) {
    return `${proto === "http" ? "http" : "https"}://${host}`;
  }

  // Host local (desenvolvimento) ou ausente: usa o endereço configurado, se houver.
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  return new URL(request.url).origin;
}
