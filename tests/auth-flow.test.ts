import { describe, expect, it } from "vitest";
import { emailOtpType, isOAuthProviderEnabled, isPasswordRecoveryPath, MIN_PASSWORD_LENGTH, passwordRecoveryRedirect, passwordSignInError, signUpError } from "@/lib/auth-flow";
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

  it("keeps an authenticated recovery session on the password reset form", () => {
    expect(isPasswordRecoveryPath("/login", new URLSearchParams("recovery=1"))).toBe(true);
    expect(isPasswordRecoveryPath("/login", new URLSearchParams())).toBe(false);
    expect(isPasswordRecoveryPath("/app", new URLSearchParams("recovery=1"))).toBe(false);
  });

  it("explains sign-up failures without exposing raw Supabase errors", () => {
    expect(signUpError({ code: "user_already_exists" })).toMatch(/Já existe uma conta/);
    expect(signUpError({ message: "User already registered" })).toMatch(/Já existe uma conta/);
    expect(signUpError({ code: "weak_password" })).toMatch(new RegExp(`${MIN_PASSWORD_LENGTH} caracteres`));
    expect(signUpError({ status: 429 })).toMatch(/Muitas tentativas/);
    expect(signUpError({ message: "boom" })).toMatch(/Não foi possível criar a conta/);
  });

  it("accepts only known e-mail link types in the callback", () => {
    expect(emailOtpType("signup")).toBe("signup");
    expect(emailOtpType("recovery")).toBe("recovery");
    expect(emailOtpType("sms")).toBeNull();
    expect(emailOtpType(null)).toBeNull();
  });

  it("reports whether an OAuth provider is enabled in the public auth settings", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemplo.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_teste";
    const respond = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
    expect(await isOAuthProviderEnabled("google", respond({ external: { google: false } }))).toBe(false);
    expect(await isOAuthProviderEnabled("google", respond({ external: { google: true } }))).toBe(true);
    expect(await isOAuthProviderEnabled("google", respond({}, false))).toBe(true);
    const offline = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    expect(await isOAuthProviderEnabled("google", offline)).toBe(true);
  });

  it("does not permit an external post-auth redirect", () => {
    expect(safeInternalPath("https://attacker.example")).toBe("/app");
    expect(safeInternalPath("/login?recovery=1")).toBe("/login?recovery=1");
  });
});
