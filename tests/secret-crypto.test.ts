import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, parseMasterKey } from "@/lib/secret-crypto";

const key = randomBytes(32);

describe("cifra das credenciais do painel", () => {
  it("cifra e decifra, e o texto cifrado não contém o valor", () => {
    const enc = encryptSecret("sk-proj-segredo-123456", "OPENAI_API_KEY", key);
    expect(enc).not.toContain("segredo");
    expect(decryptSecret(enc, "OPENAI_API_KEY", key)).toBe("sk-proj-segredo-123456");
  });

  it("gera textos diferentes para o mesmo valor (IV aleatório)", () => {
    expect(encryptSecret("abc12345", "OPENAI_API_KEY", key)).not.toBe(encryptSecret("abc12345", "OPENAI_API_KEY", key));
  });

  it("recusa texto copiado para outro nome de credencial", () => {
    const enc = encryptSecret("valor-do-teste", "MP_ACCESS_TOKEN_TEST", key);
    expect(decryptSecret(enc, "MP_ACCESS_TOKEN_PROD", key)).toBeNull();
  });

  it("recusa texto adulterado, formato inválido e chave mestra diferente", () => {
    const enc = encryptSecret("valor-do-teste", "OPENAI_API_KEY", key);
    const parts = enc.split(".");
    parts[3] = Buffer.from("adulterado").toString("base64url");
    expect(decryptSecret(parts.join("."), "OPENAI_API_KEY", key)).toBeNull();
    expect(decryptSecret("lixo", "OPENAI_API_KEY", key)).toBeNull();
    expect(decryptSecret(enc, "OPENAI_API_KEY", randomBytes(32))).toBeNull();
  });

  it("só aceita chave mestra de 32 bytes em base64", () => {
    expect(parseMasterKey(randomBytes(32).toString("base64"))).toHaveLength(32);
    expect(parseMasterKey(randomBytes(16).toString("base64"))).toBeNull();
    expect(parseMasterKey("")).toBeNull();
    expect(parseMasterKey(undefined)).toBeNull();
  });
});
