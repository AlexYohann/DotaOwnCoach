import { describe, expect, it } from "vitest";
import { isCronAuthorized } from "@/lib/cron-auth";

describe("isCronAuthorized", () => {
  it("aceita só Bearer + o segredo exato", () => {
    expect(isCronAuthorized("Bearer s3cr3t-long", "s3cr3t-long")).toBe(true);
    expect(isCronAuthorized("Bearer errado", "s3cr3t-long")).toBe(false);
    expect(isCronAuthorized("Bearer s3cr3t-long-e-mais", "s3cr3t-long")).toBe(false);
    expect(isCronAuthorized("s3cr3t-long", "s3cr3t-long")).toBe(false); // sem "Bearer "
    expect(isCronAuthorized("bearer s3cr3t-long", "s3cr3t-long")).toBe(false);
  });

  it("sem cabeçalho não autoriza", () => {
    expect(isCronAuthorized(null, "s3cr3t-long")).toBe(false);
    expect(isCronAuthorized("", "s3cr3t-long")).toBe(false);
  });

  it("segredo não configurado nunca autoriza", () => {
    expect(isCronAuthorized("Bearer ", "")).toBe(false);
    expect(isCronAuthorized("Bearer undefined", undefined)).toBe(false);
    expect(isCronAuthorized("Bearer ", undefined)).toBe(false);
  });
});
