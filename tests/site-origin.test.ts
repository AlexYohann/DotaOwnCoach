import { describe, expect, it } from "vitest";
import { trustedOrigin } from "@/lib/site-origin";

const VERCEL = {
  VERCEL: "1",
  VERCEL_PROJECT_PRODUCTION_URL: "dota-own-coach.vercel.app",
  VERCEL_URL: "dota-own-coach-abc123-alex.vercel.app",
  VERCEL_BRANCH_URL: "dota-own-coach-git-v20-alex.vercel.app",
};

describe("trustedOrigin", () => {
  it.each([
    "https://dota-own-coach.vercel.app",
    "https://dota-own-coach-abc123-alex.vercel.app",
    "https://dota-own-coach-git-v20-alex.vercel.app",
  ])("na Vercel aceita %s", (origin) => {
    expect(trustedOrigin(origin, VERCEL)).toBe(origin);
  });

  it.each([
    "https://evil.example",
    "http://dota-own-coach.vercel.app", // sem https
    "https://outro-projeto.vercel.app",
    "http://localhost:3000", // localhost não vale na Vercel
  ])("na Vercel recusa %s", (origin) => {
    expect(trustedOrigin(origin, VERCEL)).toBeNull();
  });

  it.each(["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:4000"])(
    "fora da Vercel aceita %s",
    (origin) => {
      expect(trustedOrigin(origin, {})).toBe(origin);
    },
  );

  it.each(["https://evil.example", "http://localhost.evil.example:3000"])(
    "fora da Vercel recusa %s",
    (origin) => {
      expect(trustedOrigin(origin, {})).toBeNull();
    },
  );

  it("variável da Vercel ausente não libera nada (nem 'https://undefined')", () => {
    expect(trustedOrigin("https://undefined", { VERCEL: "1" })).toBeNull();
  });
});
