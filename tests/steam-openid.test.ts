import { describe, expect, it, vi } from "vitest";
import {
  buildSteamLoginUrl,
  STEAM_CALLBACK_PATH,
  STEAM_OPENID_ENDPOINT,
  verifySteamResponse,
} from "@/lib/steam-openid";

const ORIGIN = "http://localhost:3000";
const STEAM_ID = "76561198065514372";
const CLAIMED = `https://steamcommunity.com/openid/id/${STEAM_ID}`;

// Resposta da Steam no formato real (campos vistos no protótipo de 2026-11-10).
function validParams(overrides: Record<string, string | null> = {}) {
  const base: Record<string, string> = {
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "id_res",
    "openid.op_endpoint": STEAM_OPENID_ENDPOINT,
    "openid.claimed_id": CLAIMED,
    "openid.identity": CLAIMED,
    "openid.return_to": ORIGIN + STEAM_CALLBACK_PATH,
    "openid.response_nonce": "2026-11-10T18:27:23Zabc",
    "openid.assoc_handle": "1234567890",
    "openid.signed":
      "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
    "openid.sig": "assinatura-falsa=",
  };
  const p = new URLSearchParams(base);
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null) p.delete(k);
    else p.set(k, v);
  }
  return p;
}

const steamSays = (text: string, status = 200) =>
  vi.fn<typeof fetch>().mockResolvedValue(new Response(text, { status }));
const VALID = "ns:http://specs.openid.net/auth/2.0\nis_valid:true\n";

describe("buildSteamLoginUrl", () => {
  it("monta checkid_setup com return_to e realm da origem", () => {
    const url = buildSteamLoginUrl(ORIGIN);
    expect(url.startsWith(STEAM_OPENID_ENDPOINT + "?")).toBe(true);
    const p = new URL(url).searchParams;
    expect(p.get("openid.mode")).toBe("checkid_setup");
    expect(p.get("openid.ns")).toBe("http://specs.openid.net/auth/2.0");
    expect(p.get("openid.return_to")).toBe(ORIGIN + STEAM_CALLBACK_PATH);
    expect(p.get("openid.realm")).toBe(ORIGIN);
    const select = "http://specs.openid.net/auth/2.0/identifier_select";
    expect(p.get("openid.identity")).toBe(select);
    expect(p.get("openid.claimed_id")).toBe(select);
  });
});

describe("verifySteamResponse", () => {
  it("resposta válida e confirmada pela Steam devolve o SteamID64", async () => {
    const fetchFn = steamSays(VALID);

    await expect(verifySteamResponse(validParams(), ORIGIN, fetchFn)).resolves.toBe(
      STEAM_ID,
    );

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(STEAM_OPENID_ENDPOINT);
    expect(init?.method).toBe("POST");
    const body = new URLSearchParams(String(init?.body));
    expect(body.get("openid.mode")).toBe("check_authentication");
    expect(body.get("openid.sig")).toBe("assinatura-falsa=");
    expect(body.get("openid.claimed_id")).toBe(CLAIMED);
  });

  it.each([
    ["mode cancel", { "openid.mode": "cancel" }],
    ["mode ausente", { "openid.mode": null }],
    ["op_endpoint de outro site", { "openid.op_endpoint": "https://evil.example/openid/login" }],
    ["return_to de outra origem", { "openid.return_to": "https://evil.example/auth/steam/callback" }],
    ["return_to com outro caminho", { "openid.return_to": ORIGIN + "/auth/steam/callback-x" }],
    ["claimed_id curto demais", { "openid.claimed_id": "https://steamcommunity.com/openid/id/123", "openid.identity": "https://steamcommunity.com/openid/id/123" }],
    ["claimed_id de outro site", { "openid.claimed_id": `https://evil.example/openid/id/${STEAM_ID}`, "openid.identity": `https://evil.example/openid/id/${STEAM_ID}` }],
    ["identity diferente de claimed_id", { "openid.identity": "https://steamcommunity.com/openid/id/76561198000000000" }],
  ])("recusa localmente (%s) sem chamar a Steam", async (_, overrides) => {
    const fetchFn = steamSays(VALID);
    await expect(
      verifySteamResponse(validParams(overrides), ORIGIN, fetchFn),
    ).resolves.toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("return_to com query string no mesmo caminho é aceito", async () => {
    const params = validParams({
      "openid.return_to": ORIGIN + STEAM_CALLBACK_PATH + "?x=1",
    });
    await expect(verifySteamResponse(params, ORIGIN, steamSays(VALID))).resolves.toBe(
      STEAM_ID,
    );
  });

  // Ataque achado na revisão final: get() lê a 1ª ocorrência, o corpo da
  // check_authentication levava a última. Vítima na frente, resposta
  // genuína do atacante atrás → a Steam confirmava a do atacante.
  it("claimed_id/identity duplicados (vítima + resposta genuína do atacante) recusa", async () => {
    const VICTIM = "https://steamcommunity.com/openid/id/76561198000000001";
    const attack = new URLSearchParams();
    attack.append("openid.claimed_id", VICTIM);
    attack.append("openid.identity", VICTIM);
    for (const [k, v] of validParams()) attack.append(k, v);
    // "Steam" de verdade: só confirma o que ela assinou (o ID do atacante).
    const fetchFn = vi.fn<typeof fetch>(async (_url, init) => {
      const body = new URLSearchParams(String(init?.body));
      return new Response(body.get("openid.claimed_id") === CLAIMED ? VALID : "is_valid:false");
    });
    await expect(verifySteamResponse(attack, ORIGIN, fetchFn)).resolves.toBeNull();
  });

  it.each(["openid.sig", "openid.return_to", "openid.op_endpoint", "openid.signed"])(
    "qualquer openid.* repetido (%s) recusa sem chamar a Steam",
    async (key) => {
      const params = validParams();
      params.append(key, params.get(key)!);
      const fetchFn = steamSays(VALID);
      await expect(verifySteamResponse(params, ORIGIN, fetchFn)).resolves.toBeNull();
      expect(fetchFn).not.toHaveBeenCalled();
    },
  );

  it.each(["claimed_id", "identity", "return_to", "op_endpoint", "response_nonce", "assoc_handle"])(
    "openid.signed sem %s recusa sem chamar a Steam",
    async (field) => {
      const signed = "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle"
        .split(",")
        .filter((f) => f !== field)
        .join(",");
      const fetchFn = steamSays(VALID);
      await expect(
        verifySteamResponse(validParams({ "openid.signed": signed }), ORIGIN, fetchFn),
      ).resolves.toBeNull();
      expect(fetchFn).not.toHaveBeenCalled();
    },
  );

  it("Steam responde is_valid:false recusa", async () => {
    const fetchFn = steamSays("ns:http://specs.openid.net/auth/2.0\nis_valid:false\n");
    await expect(verifySteamResponse(validParams(), ORIGIN, fetchFn)).resolves.toBeNull();
  });

  it("resposta da Steam sem is_valid recusa", async () => {
    await expect(
      verifySteamResponse(validParams(), ORIGIN, steamSays("ok")),
    ).resolves.toBeNull();
  });

  it("HTTP 500 da Steam recusa", async () => {
    await expect(
      verifySteamResponse(validParams(), ORIGIN, steamSays(VALID, 500)),
    ).resolves.toBeNull();
  });

  it("falha de rede/timeout recusa", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    await expect(verifySteamResponse(validParams(), ORIGIN, fetchFn)).resolves.toBeNull();
  });
});
