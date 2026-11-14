import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Dublês: uma linha de `matches` em memória, OpenDota e refreshMatchDetail.

type Row = {
  match_id: number;
  start_time: string;
  detail: { version: number; match: { parsed: boolean } } | null;
  parse_requested_at: string | null;
  parse_job_id: number | null;
};
let row: Row | null;
let recentRequests: number; // pedidos nas últimas 24 h (o que o count devolve)
let recentMinute: number; // pedidos no último minuto
let adminEnabled: boolean;
let updates: Record<string, unknown>[];

// Query builder mínimo: aplica o UPDATE só se os filtros baterem, como o
// Postgres — a segunda reserva da mesma partida não acha linha.
function builder() {
  const filters: ((r: Row) => boolean)[] = [];
  let payload: Record<string, unknown> | null = null;
  let isCount = false;
  let since: string | null = null;
  const run = () => {
    if (isCount) {
      const lastMinute = since !== null && NOW - Date.parse(since) <= 61_000;
      return { count: lastMinute ? recentMinute : recentRequests, error: null, data: null };
    }
    const hit = row && filters.every((f) => f(row!)) ? row : null;
    if (payload) {
      if (hit) {
        Object.assign(hit, payload);
        updates.push({ ...payload });
      }
      return { data: hit ? [{ match_id: hit.match_id }] : [], error: null };
    }
    return { data: hit ? { ...hit } : null, error: null };
  };
  const b = {
    select: (_cols?: string, opts?: { count?: string }) => {
      if (opts?.count) isCount = true;
      return b;
    },
    update: (p: Record<string, unknown>) => ((payload = p), b),
    eq: (col: keyof Row, v: unknown) => (filters.push((r) => r[col] === v), b),
    is: (col: keyof Row, v: null) => (filters.push((r) => r[col] === v), b),
    gte: (_col: string, v: string) => ((since = v), b),
    maybeSingle: () => Promise.resolve(run()),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(run()).then(resolve, reject),
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => (adminEnabled ? { from: () => builder() } : null),
}));

vi.mock("@/lib/opendota", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/opendota")>();
  return { OpenDotaError: real.OpenDotaError, requestParse: vi.fn(), getParseJob: vi.fn() };
});
vi.mock("@/lib/data", () => ({ refreshMatchDetail: vi.fn() }));

import * as od from "@/lib/opendota";
import * as data from "@/lib/data";
import { checkMatchParse, requestMatchParse } from "@/lib/match-parse";

const api = vi.mocked(od);
const refresh = vi.mocked(data.refreshMatchDetail);

const NOW = Date.parse("2026-11-14T12:00:00Z");
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const unparsedDetail = { version: 4, match: { parsed: false } };

beforeEach(() => {
  row = {
    match_id: 100,
    start_time: iso(NOW - 2 * DAY),
    detail: unparsedDetail,
    parse_requested_at: null,
    parse_job_id: null,
  };
  recentRequests = 0;
  recentMinute = 0;
  adminEnabled = true;
  updates = [];
  api.requestParse.mockReset().mockResolvedValue(639527695);
  api.getParseJob.mockReset().mockResolvedValue("pending");
  refresh.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("requestMatchParse", () => {
  it("partida que o site não conhece (sem linha): unknown, sem OpenDota", async () => {
    row = null;
    await expect(requestMatchParse(100, NOW)).resolves.toBe("unknown");
    expect(api.requestParse).not.toHaveBeenCalled();
  });

  // Corrida: a página grava o detalhe em after(), e o pedido da tela pode
  // chegar antes. A linha já existe (veio da lista de partidas do jogador).
  it("linha sem detalhe ainda (gravação em andamento): pede normalmente", async () => {
    row!.detail = null;
    await expect(requestMatchParse(100, NOW)).resolves.toBe("requested");
    expect(api.requestParse).toHaveBeenCalledTimes(1);
  });

  it("já processada: ready, sem OpenDota", async () => {
    row!.detail = { version: 4, match: { parsed: true } };
    await expect(requestMatchParse(100, NOW)).resolves.toBe("ready");
    expect(api.requestParse).not.toHaveBeenCalled();
  });

  it("partida de 15 dias: too_old e nada gravado; 13 dias passa", async () => {
    row!.start_time = iso(NOW - 15 * DAY);
    await expect(requestMatchParse(100, NOW)).resolves.toBe("too_old");
    expect(updates).toHaveLength(0);
    row!.start_time = iso(NOW - 13 * DAY);
    await expect(requestMatchParse(100, NOW)).resolves.toBe("requested");
  });

  it("teto: 50 pedidos em 24 h → limit e a partida NÃO fica marcada; 49 passa", async () => {
    recentRequests = 50;
    await expect(requestMatchParse(100, NOW)).resolves.toBe("limit");
    expect(row!.parse_requested_at).toBeNull();
    expect(api.requestParse).not.toHaveBeenCalled();
    recentRequests = 49;
    await expect(requestMatchParse(100, NOW)).resolves.toBe("requested");
  });

  it("caminho feliz: um POST e a linha com a hora e o jobId", async () => {
    await expect(requestMatchParse(100, NOW)).resolves.toBe("requested");
    expect(api.requestParse).toHaveBeenCalledTimes(1);
    expect(api.requestParse).toHaveBeenCalledWith(100);
    expect(row!.parse_requested_at).toBe(iso(NOW));
    expect(row!.parse_job_id).toBe(639527695);
  });

  it("duas chamadas ao mesmo tempo: um único POST", async () => {
    const out = await Promise.all([requestMatchParse(100, NOW), requestMatchParse(100, NOW)]);
    expect(out.sort()).toEqual(["pending", "requested"]);
    expect(api.requestParse).toHaveBeenCalledTimes(1);
  });

  it("OpenDota recusa o pedido: unavailable; a partida não é pedida de novo", async () => {
    api.requestParse.mockRejectedValue(new od.OpenDotaError("unavailable", "500"));
    await expect(requestMatchParse(100, NOW)).resolves.toBe("unavailable");
    expect(row!.parse_requested_at).toBe(iso(NOW));
    expect(row!.parse_job_id).toBeNull();
    await expect(requestMatchParse(100, NOW + 60_000)).resolves.toBe("failed");
    expect(api.requestParse).toHaveBeenCalledTimes(1);
  });

  // Revisão final, achado 2: outro pedido chega enquanto o primeiro espera a
  // OpenDota (reserva feita, jobId ainda não gravado).
  it("pedido concorrente na janela entre a reserva e o jobId: pending, não failed", async () => {
    row!.parse_requested_at = iso(NOW - 5_000);
    await expect(requestMatchParse(100, NOW)).resolves.toBe("pending");
    row!.parse_requested_at = iso(NOW - 60_000);
    await expect(requestMatchParse(100, NOW)).resolves.toBe("failed");
    expect(api.requestParse).not.toHaveBeenCalled();
  });

  // Achado 3: o limite da OpenDota também é por minuto (60), e cada pedido
  // pesa 10. Seis partidas abertas em sequência derrubariam o site.
  it("3 pedidos no último minuto: busy, sem reservar; 2 passa", async () => {
    recentMinute = 3;
    await expect(requestMatchParse(100, NOW)).resolves.toBe("busy");
    expect(row!.parse_requested_at).toBeNull();
    expect(api.requestParse).not.toHaveBeenCalled();
    recentMinute = 2;
    await expect(requestMatchParse(100, NOW)).resolves.toBe("requested");
  });

  it("OpenDota responde 429: busy e a reserva é desfeita (a partida não perde a chance)", async () => {
    api.requestParse.mockRejectedValue(new od.OpenDotaError("rate_limit", "429"));
    await expect(requestMatchParse(100, NOW)).resolves.toBe("busy");
    expect(row!.parse_requested_at).toBeNull();
    api.requestParse.mockResolvedValue(639527695);
    await expect(requestMatchParse(100, NOW)).resolves.toBe("requested");
  });

  // Achado 9: a OpenDota processa partidas de profissionais sozinha, minutos
  // depois do fim. Conferir antes custa 1 chamada e economiza 9.
  it("a OpenDota já processou sozinha: ready sem pedir de novo", async () => {
    refresh.mockResolvedValue({ parsed: true } as never);
    await expect(requestMatchParse(100, NOW)).resolves.toBe("ready");
    expect(refresh).toHaveBeenCalledWith(100);
    expect(api.requestParse).not.toHaveBeenCalled();
    expect(row!.parse_job_id).toBeNull();
  });

  it("a conferência prévia falha (OpenDota fora): pede assim mesmo", async () => {
    refresh.mockRejectedValue(new od.OpenDotaError("unavailable", "timeout"));
    await expect(requestMatchParse(100, NOW)).resolves.toBe("requested");
    expect(api.requestParse).toHaveBeenCalledTimes(1);
  });

  it("já pedida: em andamento → pending; resolvida sem sucesso → failed", async () => {
    row!.parse_requested_at = iso(NOW - 60_000);
    row!.parse_job_id = 5;
    await expect(requestMatchParse(100, NOW)).resolves.toBe("pending");
    row!.parse_job_id = null;
    await expect(requestMatchParse(100, NOW)).resolves.toBe("failed");
    expect(api.requestParse).not.toHaveBeenCalled();
  });

  it("sem secret key: unavailable, sem chamadas", async () => {
    adminEnabled = false;
    await expect(requestMatchParse(100, NOW)).resolves.toBe("unavailable");
    expect(api.requestParse).not.toHaveBeenCalled();
  });
});

describe("checkMatchParse", () => {
  beforeEach(() => {
    row!.parse_requested_at = iso(NOW - 60_000);
    row!.parse_job_id = 639527695;
  });

  it("nunca pedida, ou partida desconhecida: unknown", async () => {
    row!.parse_requested_at = null;
    row!.parse_job_id = null;
    await expect(checkMatchParse(100, NOW)).resolves.toBe("unknown");
    row = null;
    await expect(checkMatchParse(100, NOW)).resolves.toBe("unknown");
    expect(api.getParseJob).not.toHaveBeenCalled();
  });

  it("pedido feito antes de o detalhe ser gravado: acompanha normalmente", async () => {
    row!.detail = null;
    await expect(checkMatchParse(100, NOW)).resolves.toBe("pending");
  });

  it("ainda na fila: pending, nada gravado", async () => {
    await expect(checkMatchParse(100, NOW)).resolves.toBe("pending");
    expect(api.getParseJob).toHaveBeenCalledWith(639527695);
    expect(updates).toHaveLength(0);
  });

  it("terminou e veio processada: ready, detalhe regravado e pedido resolvido", async () => {
    api.getParseJob.mockResolvedValue("done");
    refresh.mockResolvedValue({ parsed: true } as never);
    await expect(checkMatchParse(100, NOW)).resolves.toBe("ready");
    expect(refresh).toHaveBeenCalledWith(100);
    expect(row!.parse_job_id).toBeNull();
  });

  it("terminou sem processar (replay inexistente): failed e pedido resolvido", async () => {
    api.getParseJob.mockResolvedValue("done");
    refresh.mockResolvedValue({ parsed: false } as never);
    await expect(checkMatchParse(100, NOW)).resolves.toBe("failed");
    expect(row!.parse_job_id).toBeNull();
  });

  it("OpenDota fora do ar durante a consulta: continua pending, nada muda", async () => {
    api.getParseJob.mockRejectedValue(new od.OpenDotaError("unavailable", "timeout"));
    await expect(checkMatchParse(100, NOW)).resolves.toBe("pending");
    expect(row!.parse_job_id).toBe(639527695);

    api.getParseJob.mockResolvedValue("done");
    refresh.mockRejectedValue(new od.OpenDotaError("unavailable", "timeout"));
    await expect(checkMatchParse(100, NOW)).resolves.toBe("pending");
    expect(row!.parse_job_id).toBe(639527695);
  });

  // Achado 1: quem fechou a aba antes de terminar e volta dias depois não
  // pode ver "falhou" se a OpenDota processou. Busca a partida uma vez só.
  it("em andamento há mais de 1 dia: busca a partida uma vez e resolve", async () => {
    row!.parse_requested_at = iso(NOW - DAY - 1000);
    refresh.mockResolvedValue({ parsed: true } as never);
    await expect(checkMatchParse(100, NOW)).resolves.toBe("ready");
    expect(row!.parse_job_id).toBeNull();
    expect(api.getParseJob).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("em andamento há mais de 1 dia e não processada: failed", async () => {
    row!.parse_requested_at = iso(NOW - DAY - 1000);
    refresh.mockResolvedValue({ parsed: false } as never);
    await expect(checkMatchParse(100, NOW)).resolves.toBe("failed");
    expect(row!.parse_job_id).toBeNull();
  });

  it("reserva recente ainda sem jobId: pending, sem chamar a OpenDota", async () => {
    row!.parse_requested_at = iso(NOW - 10_000);
    row!.parse_job_id = null;
    await expect(checkMatchParse(100, NOW)).resolves.toBe("pending");
    expect(api.getParseJob).not.toHaveBeenCalled();
  });

  it("já resolvida: ready ou failed direto do banco", async () => {
    row!.parse_job_id = null;
    row!.detail = { version: 4, match: { parsed: true } };
    await expect(checkMatchParse(100, NOW)).resolves.toBe("ready");
    row!.detail = unparsedDetail;
    await expect(checkMatchParse(100, NOW)).resolves.toBe("failed");
    expect(api.getParseJob).not.toHaveBeenCalled();
  });

  it("sem secret key: unknown, sem chamadas", async () => {
    adminEnabled = false;
    await expect(checkMatchParse(100, NOW)).resolves.toBe("unknown");
    expect(api.getParseJob).not.toHaveBeenCalled();
  });
});
