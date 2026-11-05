import { describe, expect, it } from "vitest";
import { calculateDeadline, easter, formatDate, holidaysOf, urgencyOf } from "@/lib/prazos";

describe("feriados", () => {
  it("calcula a Páscoa corretamente", () => {
    expect(formatDate(easter(2026))).toBe("2026-04-05");
    expect(formatDate(easter(2027))).toBe("2027-03-28");
    expect(formatDate(easter(2025))).toBe("2025-04-20");
  });
  it("inclui Carnaval, Sexta-feira Santa, Corpus Christi e Consciência Negra", () => {
    const h = holidaysOf(2026);
    expect(h.get("2026-02-16")).toMatch(/Carnaval/);
    expect(h.get("2026-02-17")).toMatch(/Carnaval/);
    expect(h.get("2026-04-03")).toBe("Sexta-feira Santa");
    expect(h.get("2026-06-04")).toBe("Corpus Christi");
    expect(h.get("2026-11-20")).toMatch(/Consciência Negra/);
  });
  it("Justiça Federal tem os dias da Lei 5.010/1966", () => {
    expect(holidaysOf(2026, "federal").has("2026-12-08")).toBe(true);
    expect(holidaysOf(2026, "estadual").has("2026-12-08")).toBe(false);
  });
});

describe("prazo em dias úteis (CPC art. 219 e 224)", () => {
  it("exclui o dia da intimação e conta só dias úteis", () => {
    const r = calculateDeadline({ startDate: "2026-03-02", days: 15, counting: "business" });
    expect(r.firstDay).toBe("2026-03-03");
    expect(r.dueDate).toBe("2026-03-23");
  });
  it("pula a Sexta-feira Santa", () => {
    const r = calculateDeadline({ startDate: "2026-04-01", days: 5, counting: "business" });
    expect(r.dueDate).toBe("2026-04-09");
    expect(r.skipped.map((s) => s.date)).toContain("2026-04-03");
  });
  it("suspende no recesso de 20/12 a 20/01 (art. 220)", () => {
    const r = calculateDeadline({ startDate: "2026-12-17", days: 5, counting: "business" });
    expect(r.dueDate).toBe("2027-01-26");
  });
  it("pula o feriado de 20 de novembro", () => {
    expect(calculateDeadline({ startDate: "2026-11-19", days: 1, counting: "business" }).dueDate).toBe("2026-11-23");
  });
  it("prazo em dobro dobra os dias", () => {
    const simples = calculateDeadline({ startDate: "2026-03-02", days: 15, counting: "business" });
    const dobro = calculateDeadline({ startDate: "2026-03-02", days: 15, counting: "business", doubled: true });
    expect(dobro.effectiveDays).toBe(30);
    expect(dobro.dueDate > simples.dueDate).toBe(true);
  });
  it("DJe: publicação no dia útil seguinte à disponibilização", () => {
    const r = calculateDeadline({ startDate: "2026-03-06", days: 1, counting: "business", startMode: "dje" });
    expect(r.publicationDate).toBe("2026-03-09");
    expect(r.dueDate).toBe("2026-03-10");
  });
  it("respeita feriado local informado e o calendário da Justiça Federal", () => {
    expect(calculateDeadline({ startDate: "2026-03-02", days: 1, counting: "business", extraHolidays: ["2026-03-03"] }).dueDate).toBe("2026-03-04");
    expect(calculateDeadline({ startDate: "2026-12-07", days: 1, counting: "business", court: "federal" }).dueDate).toBe("2026-12-09");
    expect(calculateDeadline({ startDate: "2026-12-07", days: 1, counting: "business", court: "estadual" }).dueDate).toBe("2026-12-08");
  });
});

describe("prazo em dias corridos", () => {
  it("prorroga quando o vencimento cai em fim de semana", () => {
    const r = calculateDeadline({ startDate: "2026-01-02", days: 30, counting: "calendar" });
    expect(r.dueDate).toBe("2026-02-02");
  });
});

describe("validação e urgência", () => {
  it("rejeita prazo inválido e data inválida", () => {
    expect(() => calculateDeadline({ startDate: "2026-03-02", days: 0, counting: "business" })).toThrow();
    expect(() => calculateDeadline({ startDate: "2026-02-30", days: 5, counting: "business" })).toThrow();
  });
  it("classifica a urgência", () => {
    const hoje = new Date(2026, 2, 10);
    expect(urgencyOf("2026-03-09", hoje)).toBe("overdue");
    expect(urgencyOf("2026-03-10", hoje)).toBe("today");
    expect(urgencyOf("2026-03-12", hoje)).toBe("soon");
    expect(urgencyOf("2026-03-30", hoje)).toBe("later");
  });
});
