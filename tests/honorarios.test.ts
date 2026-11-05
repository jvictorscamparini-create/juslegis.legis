import { describe, expect, it } from "vitest";
import { custas, honorariosContratuais, honorariosFazenda, honorariosPrivados } from "@/lib/honorarios";

describe("honorários entre particulares (art. 85, § 2º)", () => {
  it("calcula a faixa de 10% a 20% e o percentual escolhido", () => {
    const r = honorariosPrivados({ base: 100_000, percent: 15 });
    expect(r).toMatchObject({ min: 10_000, max: 20_000, chosen: 15_000, percentApplied: 15, capped: false });
  });
  it("soma os recursais sem passar de 20% (§ 11)", () => {
    const r = honorariosPrivados({ base: 100_000, percent: 15, recursalPercent: 10 });
    expect(r.percentApplied).toBe(20);
    expect(r.chosen).toBe(20_000);
    expect(r.capped).toBe(true);
  });
  it("rejeita percentual fora da faixa legal", () => {
    expect(() => honorariosPrivados({ base: 1000, percent: 25 })).toThrow();
  });
});

describe("honorários contra a Fazenda (art. 85, §§ 3º e 5º)", () => {
  it("dentro da primeira faixa aplica 10% a 20%", () => {
    const r = honorariosFazenda({ base: 100_000, salarioMinimo: 1000 });
    expect(r.faixas).toHaveLength(1);
    expect(r).toMatchObject({ min: 10_000, max: 20_000, chosen: 10_000 });
  });
  it("escalona entre faixas (§ 5º)", () => {
    // 300 salários de R$ 1.000: 200 SM na 1ª faixa (10–20%) e 100 SM na 2ª (8–10%).
    const r = honorariosFazenda({ base: 300_000, salarioMinimo: 1000, position: 1 });
    expect(r.faixas).toHaveLength(2);
    expect(r.min).toBe(200_000 * 0.1 + 100_000 * 0.08);
    expect(r.max).toBe(200_000 * 0.2 + 100_000 * 0.1);
    expect(r.chosen).toBe(r.max);
  });
  it("posição intermediária fica entre o mínimo e o máximo", () => {
    const r = honorariosFazenda({ base: 300_000, salarioMinimo: 1000, position: 0.5 });
    expect(r.chosen).toBe((r.min + r.max) / 2);
  });
});

describe("contratuais e custas", () => {
  it("soma percentual e fixo", () => {
    expect(honorariosContratuais({ base: 50_000, percent: 30, fixo: 2_000 })).toEqual({ percentual: 15_000, fixo: 2_000, total: 17_000 });
  });
  it("aplica mínimo e máximo das custas", () => {
    expect(custas({ valorCausa: 1_000, percent: 1, minimo: 50 })).toMatchObject({ aplicado: 50, limitadoPor: "minimo" });
    expect(custas({ valorCausa: 10_000_000, percent: 1, maximo: 40_000, taxasFixas: 100 })).toMatchObject({ aplicado: 40_000, total: 40_100, limitadoPor: "maximo" });
    expect(custas({ valorCausa: 20_000, percent: 1.5 })).toMatchObject({ aplicado: 300, limitadoPor: null });
  });
  it("rejeita mínimo maior que o máximo", () => {
    expect(() => custas({ valorCausa: 1000, percent: 1, minimo: 100, maximo: 50 })).toThrow();
  });
});
