import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings, parseSetting } from "@/lib/settings";

describe("settings", () => {
  it("usa padrões sem linhas e ignora linhas inválidas", () => {
    expect(mergeSettings([])).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings([{ key: "trial", value: { days: "x" } }]).trial).toEqual(DEFAULT_SETTINGS.trial);
  });
  it("aplica valores válidos", () => {
    expect(mergeSettings([{ key: "trial", value: { ...DEFAULT_SETTINGS.trial, days: 14 } }]).trial.days).toBe(14);
  });
  it("valida limites", () => {
    expect(parseSetting("ai_model", { ...DEFAULT_SETTINGS.ai_model, temperature: 5 }).success).toBe(false);
    expect(parseSetting("ai_model", { ...DEFAULT_SETTINGS.ai_model, provider: "gemini" }).success).toBe(false);
    expect(parseSetting("plan", { ...DEFAULT_SETTINGS.plan, price_brl: -1 }).success).toBe(false);
  });
});
