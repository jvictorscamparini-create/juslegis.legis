import { describe, expect, it } from "vitest";
import { isAdminProfile } from "@/lib/authorization";

describe("server-managed admin authorization", () => {
  it("allows only active profiles with the admin role", () => {
    expect(isAdminProfile({ role: "admin", status: "active" })).toBe(true);
    expect(isAdminProfile({ role: "user", status: "active" })).toBe(false);
    expect(isAdminProfile({ role: "admin", status: "blocked" })).toBe(false);
    expect(isAdminProfile(null)).toBe(false);
  });
});
