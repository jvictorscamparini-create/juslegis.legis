import { describe, expect, it } from "vitest";
import { AuthTimeoutError, networkErrorMessage, oauthProviderStatus, withTimeout } from "@/lib/auth-flow";
import { relativeRedirect } from "@/lib/relative-redirect";
import { postLoginPath } from "@/lib/safe-redirect";

describe("postLoginPath", () => {
  it("keeps the page the user originally asked for", () => {
    expect(postLoginPath("/app/peticoes?id=1")).toBe("/app/peticoes?id=1");
    expect(postLoginPath("/admin/usuarios")).toBe("/admin/usuarios");
  });

  it("never sends the user back to the login screen or auth routes (redirect loop)", () => {
    for (const value of ["/login", "/login?next=/app", "/auth/callback?code=x", "/auth/signout"]) {
      expect(postLoginPath(value)).toBe("/app");
    }
  });

  it("still refuses external destinations", () => {
    for (const value of ["https://attacker.example", "//attacker.example", "/\\attacker.example", null]) {
      expect(postLoginPath(value)).toBe("/app");
    }
  });
});

describe("relativeRedirect", () => {
  it("uses a relative Location so proxies cannot leak the internal host", () => {
    const res = relativeRedirect("/login?erro=oauth");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/login?erro=oauth");
  });

  it("drops external targets", () => {
    expect(relativeRedirect("https://attacker.example", 307).headers.get("location")).toBe("/app");
  });
});

describe("oauthProviderStatus", () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemplo.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_teste";
  const respond = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

  it("distinguishes disabled, enabled and unknown", async () => {
    expect(await oauthProviderStatus("google", respond({ external: { google: false } }))).toBe(false);
    expect(await oauthProviderStatus("google", respond({ external: { google: true } }))).toBe(true);
    expect(await oauthProviderStatus("google", respond({}, false))).toBeNull();
    const offline = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    expect(await oauthProviderStatus("google", offline)).toBeNull();
  });

  it("gives up after the timeout instead of hanging", async () => {
    const hanging = ((_url: string, init?: RequestInit) =>
      new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof fetch;
    expect(await oauthProviderStatus("google", hanging, 20)).toBeNull();
  });
});

describe("withTimeout", () => {
  it("resolves fast calls and rejects slow ones with a clear message", async () => {
    await expect(withTimeout(Promise.resolve(1), 50)).resolves.toBe(1);
    const slow = new Promise((resolve) => setTimeout(resolve, 200));
    await expect(withTimeout(slow, 10)).rejects.toBeInstanceOf(AuthTimeoutError);
    expect(networkErrorMessage(new AuthTimeoutError())).toMatch(/demorou para responder/);
    expect(networkErrorMessage(new Error("fetch failed"))).toMatch(/Não foi possível conectar/);
  });
});
