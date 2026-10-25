import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Cifra autenticada (AES-256-GCM). O nome da credencial entra como dado associado (AAD):
// um texto cifrado copiado de uma linha para outra deixa de decifrar.
// Formato: v1.<iv base64url>.<tag base64url>.<dados base64url>

const VERSION = "v1";

export function parseMasterKey(raw: string | undefined | null): Buffer | null {
  if (!raw) return null;
  const buf = Buffer.from(raw.trim(), "base64");
  return buf.length === 32 ? buf : null;
}

export function encryptSecret(plain: string, name: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(name, "utf8"));
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(".");
}

/** Retorna null se o texto estiver adulterado, for de outro nome ou a chave mestra for outra. */
export function decryptSecret(payload: string, name: string, key: Buffer): string | null {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== VERSION || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(name, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
