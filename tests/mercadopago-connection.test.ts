import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testMercadoPago } from "@/lib/connection-tests";

type Route = { status: number; body: unknown };

function mpApi(routes: { methods: Route; me?: Route }) {
  const calls: { url: string; auth: string | null }[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, auth: new Headers(init?.headers).get("authorization") });
    const route = url.endsWith("/v1/payment_methods") ? routes.methods : routes.me ?? { status: 403, body: {} };
    return new Response(JSON.stringify(route.body), { status: route.status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const accepted: Route = { status: 200, body: [{ id: "pix" }] };
const policyBlock: Route = {
  status: 403,
  body: { message: "At least one policy returned UNAUTHORIZED.", code: "PA_UNAUTHORIZED_RESULT_FROM_POLICIES", blocked_by: "PolicyAgent" },
};
const testAccount: Route = { status: 200, body: { id: 1, nickname: "TESTUSER123", site_id: "MLB" } };
const realAccount: Route = { status: 200, body: { id: 2, nickname: "ESCRITORIO", site_id: "MLB" } };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  vi.stubEnv("APP_SECRETS_KEY", "");
  vi.stubEnv("MERCADO_PAGO_ACCESS_TOKEN", "");
  vi.stubEnv("MP_ACCESS_TOKEN_TEST", "");
  vi.stubEnv("MP_ACCESS_TOKEN_PROD", "");
  vi.stubEnv("MP_WEBHOOK_SECRET", "segredo");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("testMercadoPago (teste)", () => {
  it("sem credencial, falha sem chamar a rede", async () => {
    const api = mpApi({ methods: accepted });
    const result = await testMercadoPago("test", api.impl);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("não definida");
    expect(api.calls).toHaveLength(0);
  });

  it("valida pela rota da documentação e envia o token no Authorization", async () => {
    vi.stubEnv("MP_ACCESS_TOKEN_TEST", "TEST-abc");
    const api = mpApi({ methods: accepted, me: testAccount });
    expect((await testMercadoPago("test", api.impl)).ok).toBe(true);
    expect(api.calls[0]).toEqual({ url: "https://api.mercadopago.com/v1/payment_methods", auth: "Bearer TEST-abc" });
  });

  it("aceita o token quando só /users/me é bloqueado, avisando que a conta não foi identificada", async () => {
    vi.stubEnv("MP_ACCESS_TOKEN_TEST", "TEST-abc");
    const result = await testMercadoPago("test", mpApi({ methods: accepted, me: policyBlock }).impl);
    expect(result.ok).toBe(true);
    expect(result.detail).toContain("não informou a conta");
  });

  it("aceita token APP_USR de conta de teste", async () => {
    vi.stubEnv("MP_ACCESS_TOKEN_TEST", "APP_USR-abc");
    expect((await testMercadoPago("test", mpApi({ methods: accepted, me: testAccount }).impl)).ok).toBe(true);
  });

  it("recusa token de conta real no campo de teste", async () => {
    vi.stubEnv("MP_ACCESS_TOKEN_TEST", "APP_USR-abc");
    const result = await testMercadoPago("test", mpApi({ methods: accepted, me: realAccount }).impl);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("conta real");
  });

  it("não simula sucesso quando a rota de validação é bloqueada, e mostra o código", async () => {
    vi.stubEnv("MP_ACCESS_TOKEN_TEST", "TEST-abc");
    const result = await testMercadoPago("test", mpApi({ methods: policyBlock, me: testAccount }).impl);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("HTTP 403 (PA_UNAUTHORIZED_RESULT_FROM_POLICIES)");
    expect(result.detail).not.toContain("TEST-abc");
  });

  it("explica token recusado com 401", async () => {
    vi.stubEnv("MP_ACCESS_TOKEN_TEST", "TEST-abc");
    const result = await testMercadoPago("test", mpApi({ methods: { status: 401, body: { message: "invalid_token" } } }).impl);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("Token inválido");
  });

  it("recusa a mesma credencial nos dois campos", async () => {
    vi.stubEnv("MP_ACCESS_TOKEN_TEST", "APP_USR-igual");
    vi.stubEnv("MP_ACCESS_TOKEN_PROD", "APP_USR-igual");
    const api = mpApi({ methods: accepted, me: testAccount });
    expect((await testMercadoPago("test", api.impl)).ok).toBe(false);
    expect(api.calls).toHaveLength(0);
  });
});

describe("testMercadoPago (produção)", () => {
  it("recusa conta de teste no campo de produção", async () => {
    vi.stubEnv("MP_ACCESS_TOKEN_PROD", "APP_USR-abc");
    const result = await testMercadoPago("prod", mpApi({ methods: accepted, me: testAccount }).impl);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("não de produção");
  });

  it("recusa token TEST- no campo de produção", async () => {
    vi.stubEnv("MP_ACCESS_TOKEN_PROD", "TEST-abc");
    expect((await testMercadoPago("prod", mpApi({ methods: accepted, me: policyBlock }).impl)).ok).toBe(false);
  });

  it("aceita conta real, usando apenas leitura", async () => {
    vi.stubEnv("MP_ACCESS_TOKEN_PROD", "APP_USR-abc");
    const api = mpApi({ methods: accepted, me: realAccount });
    expect((await testMercadoPago("prod", api.impl)).ok).toBe(true);
    expect(api.calls.map((c) => new URL(c.url).pathname)).toEqual(["/v1/payment_methods", "/users/me"]);
  });
});
