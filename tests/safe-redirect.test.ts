import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/lib/safe-redirect";

describe("safeInternalPath", () => {
  it("preserves an internal path, query, and fragment", () => {
    expect(safeInternalPath("/app/peticoes?id=123#editor")).toBe("/app/peticoes?id=123#editor");
  });

  it("uses the fallback for external and malformed destinations", () => {
    for (const value of ["https://attacker.example", "//attacker.example", "/\\attacker.example", null, ""]) {
      expect(safeInternalPath(value)).toBe("/app");
    }
  });
});
