import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { serviceRoleKey } from "@/lib/env";
import { canStoreSecrets, storageProblems } from "@/lib/secrets";

const KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "APP_SECRETS_KEY"];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const validMasterKey = Buffer.alloc(32, 7).toString("base64");

describe("credenciais salvas pelo painel", () => {
  it("aceita SUPABASE_SECRET_KEY quando SUPABASE_SERVICE_ROLE_KEY não existe", () => {
    process.env.SUPABASE_SECRET_KEY = "valor-de-teste";
    expect(serviceRoleKey()).toBe("valor-de-teste");
    process.env.SUPABASE_SERVICE_ROLE_KEY = "outro-valor";
    expect(serviceRoleKey()).toBe("outro-valor");
  });

  it("lista exatamente o que falta, sem expor valores", () => {
    expect(storageProblems().join(" | ")).toMatch(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(storageProblems().join(" | ")).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(storageProblems().join(" | ")).toMatch(/APP_SECRETS_KEY/);

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemplo.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_teste";
    process.env.SUPABASE_SECRET_KEY = "valor-de-teste";
    expect(storageProblems()).toEqual(["APP_SECRETS_KEY (chave mestra de cifra)"]);
    expect(canStoreSecrets()).toBe(false);
  });

  it("recusa chave mestra com tamanho errado e libera com 32 bytes em base64", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemplo.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_teste";
    process.env.SUPABASE_SECRET_KEY = "valor-de-teste";

    process.env.APP_SECRETS_KEY = "curta";
    expect(storageProblems().join(" ")).toMatch(/32 bytes/);
    expect(canStoreSecrets()).toBe(false);

    process.env.APP_SECRETS_KEY = validMasterKey;
    expect(storageProblems()).toEqual([]);
    expect(canStoreSecrets()).toBe(true);
  });
});
