import { describe, expect, it } from "vitest";
import { authConfigurationError } from "@/lib/auth-errors";

describe("Supabase authentication configuration errors", () => {
  it("explains that Google OAuth must be enabled in Supabase", () => {
    expect(authConfigurationError({ status: 400, message: "provider is not enabled" }, "google"))
      .toMatch(/habilite Google/);
  });

  it("distinguishes disabled OTP signups from an unknown account", () => {
    expect(authConfigurationError({ status: 422, code: "otp_disabled", message: "Signups not allowed for otp" }, "email"))
      .toMatch(/habilite Email\/OTP/);
  });

  it("points redirect failures to the Supabase allowlist without exposing raw errors", () => {
    expect(authConfigurationError({ status: 400, code: "redirect_uri_mismatch" }, "google"))
      .toMatch(/Redirect URLs/);
  });

  it("returns safe messages for throttling and invalid credentials", () => {
    expect(authConfigurationError({ status: 429 }, "email")).toMatch(/Muitas tentativas/);
    expect(authConfigurationError({ code: "invalid_credentials" }, "email")).toBe("E-mail ou senha incorretos.");
  });
});
