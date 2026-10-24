import { describe, expect, it } from "vitest";
import { passwordRecoveryRedirect, passwordSignInError } from "@/lib/auth-flow";
import { safeInternalPath } from "@/lib/safe-redirect";

describe("password auth flow", () => {
  it("keeps invalid credentials generic and reports throttling", () => {
    expect(passwordSignInError(400)).toBe("E-mail ou senha incorretos.");
    expect(passwordSignInError(429)).toMatch(/Muitas tentativas/);
  });

  it("returns password recovery through the PKCE callback", () => {
    expect(passwordRecoveryRedirect("https://juslegis.vercel.app")).toBe(
      "https://juslegis.vercel.app/auth/callback?next=%2Flogin%3Frecovery%3D1",
    );
  });

  it("does not permit an external post-auth redirect", () => {
    expect(safeInternalPath("https://attacker.example")).toBe("/app");
    expect(safeInternalPath("/login?recovery=1")).toBe("/login?recovery=1");
  });
});
