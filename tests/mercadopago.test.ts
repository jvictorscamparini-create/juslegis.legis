import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "@/lib/mercadopago";

const secret = "segredo-de-teste";
const sign = (dataId: string, requestId: string, ts: string) =>
  createHmac("sha256", secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest("hex");

describe("verifyWebhookSignature", () => {
  it("aceita assinatura válida", () => {
    const v1 = sign("123456", "req-1", "1700000000");
    expect(verifyWebhookSignature({ secret, signatureHeader: `ts=1700000000,v1=${v1}`, requestId: "req-1", dataId: "123456" })).toBe(true);
  });
  it("rejeita assinatura adulterada, id diferente e cabeçalho ausente", () => {
    const v1 = sign("123456", "req-1", "1700000000");
    expect(verifyWebhookSignature({ secret, signatureHeader: `ts=1700000000,v1=${v1}`, requestId: "req-1", dataId: "999" })).toBe(false);
    expect(verifyWebhookSignature({ secret: "outro", signatureHeader: `ts=1700000000,v1=${v1}`, requestId: "req-1", dataId: "123456" })).toBe(false);
    expect(verifyWebhookSignature({ secret, signatureHeader: null, requestId: "req-1", dataId: "123456" })).toBe(false);
    expect(verifyWebhookSignature({ secret, signatureHeader: "ts=1,v1=zz", requestId: null, dataId: "1" })).toBe(false);
  });
  it("rejeita timestamp fora da tolerância", () => {
    const v1 = sign("1", "r", "1700000000");
    const base = { secret, signatureHeader: `ts=1700000000,v1=${v1}`, requestId: "r", dataId: "1", toleranceSeconds: 300 };
    expect(verifyWebhookSignature({ ...base, now: 1700000000_000 + 10_000 })).toBe(true);
    expect(verifyWebhookSignature({ ...base, now: 1700000000_000 + 3_600_000 })).toBe(false);
  });
});
