import { describe, expect, it } from "vitest";
import {
  formatDateTime,
  formatDuration,
  formatStartTime,
  getSide,
  unitLabel,
  isWin,
} from "@/lib/match";

describe("isWin", () => {
  it("Radiant (slot < 128) vence quando radiant_win", () => {
    expect(isWin(0, true)).toBe(true);
    expect(isWin(4, false)).toBe(false);
  });

  it("Dire (slot >= 128) vence quando !radiant_win", () => {
    expect(isWin(128, false)).toBe(true);
    expect(isWin(132, true)).toBe(false);
  });

  it("slot 127 ainda é Radiant (limite)", () => {
    expect(isWin(127, true)).toBe(true);
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0:00"],
    [59, "0:59"],
    [60, "1:00"],
    [2519, "41:59"],
    [3725, "62:05"], // passa de 1h sem virar "1:02:05"
  ])("%i s -> %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

describe("formatação de data (horário de Brasília)", () => {
  it("converte UTC para America/Sao_Paulo", () => {
    // 2026-11-06 21:42 UTC = 18:42 em Brasília (UTC-3)
    expect(formatDateTime(new Date("2026-11-06T21:42:00Z"))).toBe(
      "06/11/2026, 18:42",
    );
  });

  it("vira o dia corretamente perto da meia-noite UTC", () => {
    // 02:30 UTC do dia 7 ainda é dia 6 em Brasília
    expect(formatDateTime(new Date("2026-11-07T02:30:00Z"))).toBe(
      "06/11/2026, 23:30",
    );
  });

  it("formatStartTime recebe segundos unix", () => {
    const unix = Date.UTC(2026, 10, 6, 21, 42) / 1000;
    expect(formatStartTime(unix)).toBe("06/11/2026, 18:42");
  });
});

describe("unitLabel", () => {
  it("urso do Lone Druid; o resto vira Unidade", () => {
    expect(unitLabel("spirit_bear")).toBe("Urso");
    expect(unitLabel("npc_dota_outra_coisa")).toBe("Unidade");
  });
});

describe("getSide", () => {
  it("slot < 128 é Radiant, >= 128 é Dire", () => {
    expect(getSide(0)).toBe("Radiant");
    expect(getSide(127)).toBe("Radiant");
    expect(getSide(128)).toBe("Dire");
    expect(getSide(132)).toBe("Dire");
  });
});
