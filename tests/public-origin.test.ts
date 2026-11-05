import { afterEach, describe, expect, it } from "vitest";
import { publicOrigin } from "@/lib/public-origin";

const req = (headers: Record<string, string>) => new Request("http://localhost:3000/auth/callback", { headers });

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe("publicOrigin", () => {
  it("usa o Host do domínio atrás de proxy", () => {
    expect(publicOrigin(req({ host: "juslegis.com.br", "x-forwarded-proto": "https" }))).toBe("https://juslegis.com.br");
  });

  it("prefere X-Forwarded-Host e usa só o primeiro valor", () => {
    expect(publicOrigin(req({ host: "localhost:3000", "x-forwarded-host": "app.exemplo.com, interno", "x-forwarded-proto": "https, http" }))).toBe("https://app.exemplo.com");
  });

  it("assume https quando o proxy não informa o protocolo", () => {
    expect(publicOrigin(req({ host: "juslegis.com.br" }))).toBe("https://juslegis.com.br");
  });

  it("respeita http explícito", () => {
    expect(publicOrigin(req({ host: "teste.exemplo.com", "x-forwarded-proto": "http" }))).toBe("http://teste.exemplo.com");
  });

  it("host local usa o site configurado", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://juslegis.com.br/";
    expect(publicOrigin(req({ host: "localhost:3000" }))).toBe("https://juslegis.com.br");
  });

  it("host local sem configuração mantém o endereço da requisição", () => {
    expect(publicOrigin(req({ host: "localhost:3000" }))).toBe("http://localhost:3000");
  });

  it("rejeita host com caracteres inválidos", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://juslegis.com.br";
    expect(publicOrigin(req({ host: "evil.com/path", "x-forwarded-host": "a b@evil.com" }))).toBe("https://juslegis.com.br");
  });
});
