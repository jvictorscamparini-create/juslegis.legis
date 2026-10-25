import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/lib/safe-redirect";

// O login devolve o advogado à tela de consentimento OAuth pelo parâmetro "next".
describe("retorno do login para a tela de consentimento OAuth", () => {
  it("preserva o caminho e o authorization_id", () => {
    const next = "/oauth/consent?authorization_id=abc-123";
    expect(safeInternalPath(next)).toBe(next);
  });

  it("não aceita desvio para outro domínio", () => {
    expect(safeInternalPath("//evil.example/oauth/consent")).toBe("/app");
    expect(safeInternalPath("https://evil.example/oauth/consent")).toBe("/app");
    expect(safeInternalPath("/\\evil.example")).not.toContain("evil.example/");
  });
});
