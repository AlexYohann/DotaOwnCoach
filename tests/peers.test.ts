import { describe, expect, it } from "vitest";
import {
  peersState,
  selectPeers,
  splitPeers,
  winPercent,
  type Peer,
  type PeersRow,
} from "@/lib/peers";

const NOW = Date.parse("2026-11-15T12:00:00Z");
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();

const peer = (id: number, withGames: number, lastPlayedMs = NOW): Peer => ({
  account_id: id,
  name: `p${id}`,
  avatar: null,
  with_games: withGames,
  with_win: Math.floor(withGames / 2),
  against_games: 0,
  against_win: 0,
  last_played: Math.floor(lastPlayedMs / 1000),
});

describe("selectPeers", () => {
  it("só quem tem 3 ou mais partidas juntos, mais partidas primeiro", () => {
    const out = selectPeers([peer(1, 5), peer(2, 2), peer(3, 10), peer(4, 3)]);
    expect(out.map((p) => p.account_id)).toEqual([3, 1, 4]);
  });

  it("empate em partidas juntos: o mais recente primeiro", () => {
    const out = selectPeers([peer(1, 4, NOW - 10 * DAY), peer(2, 4, NOW - DAY)]);
    expect(out.map((p) => p.account_id)).toEqual([2, 1]);
  });

  it("guarda no máximo 60", () => {
    const many = Array.from({ length: 80 }, (_, i) => peer(i + 1, 3 + i));
    const out = selectPeers(many);
    expect(out).toHaveLength(60);
    expect(out[0].account_id).toBe(80);
  });

  it("não altera a lista recebida", () => {
    const raw = [peer(1, 3), peer(2, 9)];
    selectPeers(raw);
    expect(raw.map((p) => p.account_id)).toEqual([1, 2]);
  });
});

describe("splitPeers", () => {
  it("recente = última partida em comum nos últimos 90 dias", () => {
    const { recent, old } = splitPeers(
      [peer(1, 9, NOW - 91 * DAY), peer(2, 5, NOW - 89 * DAY), peer(3, 4, NOW)],
      NOW,
    );
    expect(recent.map((p) => p.account_id)).toEqual([2, 3]);
    expect(old.map((p) => p.account_id)).toEqual([1]);
  });
});

describe("peersState", () => {
  const row = (r: Partial<PeersRow>): PeersRow => ({
    peers: null,
    fetched_at: null,
    refresh_started_at: null,
    refresh_failed_at: null,
    ...r,
  });

  it("sem linha ou linha vazia: pode pedir", () => {
    expect(peersState(null, NOW)).toBe("start");
    expect(peersState(row({}), NOW)).toBe("start");
  });

  it("lista com menos de 12 h: pronta", () => {
    expect(peersState(row({ peers: [], fetched_at: iso(NOW - 11 * HOUR) }), NOW)).toBe("ready");
  });

  it("lista pronta vence um pedido em andamento", () => {
    expect(
      peersState(row({ peers: [], fetched_at: iso(NOW - HOUR), refresh_started_at: iso(NOW - MIN) }), NOW),
    ).toBe("ready");
  });

  it("vencida com pedido de menos de 2 min: em andamento", () => {
    expect(
      peersState(row({ peers: [], fetched_at: iso(NOW - 13 * HOUR), refresh_started_at: iso(NOW - MIN) }), NOW),
    ).toBe("refreshing");
  });

  it("pedido com mais de 2 min sem resposta: pode pedir de novo", () => {
    expect(peersState(row({ refresh_started_at: iso(NOW - 3 * MIN) }), NOW)).toBe("start");
  });

  it("falha há menos de 10 min: não insiste", () => {
    expect(peersState(row({ refresh_failed_at: iso(NOW - 5 * MIN) }), NOW)).toBe("failed");
    expect(peersState(row({ refresh_failed_at: iso(NOW - 11 * MIN) }), NOW)).toBe("start");
  });

  it("data inválida conta como ausente", () => {
    expect(peersState(row({ fetched_at: "lixo", refresh_started_at: "lixo" }), NOW)).toBe("start");
  });
});

describe("winPercent", () => {
  it("arredonda e evita divisão por zero", () => {
    expect(winPercent(2, 3)).toBe(67);
    expect(winPercent(853, 1375)).toBe(62);
    expect(winPercent(0, 0)).toBeNull();
  });
});
