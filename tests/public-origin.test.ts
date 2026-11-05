import { afterEach, describe, expect, it, vi } from "vitest";
import { publicOrigin } from "@/lib/public-origin";

const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });

afterEach(() => vi.unstubAllEnvs());

describe("publicOrigin", () => {
  it("prefere a URL configurada mesmo com cabeçalho forjado", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://juslegis.com.br/");
    expect(publicOrigin(req("http://localhost:3000/auth/callback", { "x-forwarded-host": "evil.com" }))).toBe("https://juslegis.com.br");
  });
  it("sem URL configurada, usa o host repassado pelo proxy", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", ""); vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(publicOrigin(req("http://localhost:3000/x", { "x-forwarded-host": "preview.vercel.app", "x-forwarded-proto": "https" }))).toBe("https://preview.vercel.app");
  });
  it("rejeita host inválido e protocolo estranho", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", ""); vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(publicOrigin(req("http://localhost:3000/x", { "x-forwarded-host": "evil.com/path@x" }))).toBe("http://localhost:3000");
    expect(publicOrigin(req("http://localhost:3000/x", { "x-forwarded-host": "site.com", "x-forwarded-proto": "javascript" }))).toBe("https://site.com");
  });
  it("não confunde localhost.evil.com ou 127.example.com com localhost", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", ""); vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(publicOrigin(req("http://localhost:3000/x", { "x-forwarded-host": "localhost:3000" }))).toBe("http://localhost:3000");
    expect(publicOrigin(req("http://localhost:3000/x", { "x-forwarded-host": "127.example.com" }))).toBe("https://127.example.com");
  });
});
