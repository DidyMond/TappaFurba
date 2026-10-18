import { describe, expect, it } from "vitest";
import { redactDeep, redactSecrets, serializeError } from "../src/redact";

const SK = "sk.eyJ1IjoiZXNlbXBpbyIsImEiOiJhYmNkZWZnaGlqa2xtbm9wIn0.firma_Segreta-123";

describe("redactSecrets", () => {
  it("ripulisce access_token in un URL, in qualunque posizione della query", () => {
    expect(redactSecrets(`GET https://api.mapbox.com/x?a=1&access_token=${SK}&b=2`)).toBe(
      "GET https://api.mapbox.com/x?a=1&access_token=[REDACTED]&b=2",
    );
    expect(redactSecrets("https://api.mapbox.com/x?ACCESS_TOKEN=abc123")).toContain("ACCESS_TOKEN=[REDACTED]");
  });

  it("ripulisce un token Mapbox anche senza il parametro (sk., pk., tk.)", () => {
    for (const token of [SK, SK.replace("sk.", "pk."), SK.replace("sk.", "tk.")]) {
      const out = redactSecrets(`token usato: ${token}.`);
      expect(out).not.toContain("firma_Segreta");
      expect(out).toContain("[REDACTED_TOKEN]");
    }
  });

  it("non tocca i testi normali", () => {
    const text = "Download CSV MIMIT (prezzi) fallito: HTTP 503; skeleton.key non è un token";
    expect(redactSecrets(text)).toBe(text);
  });
});

describe("redactDeep e serializeError", () => {
  it("ripulisce le stringhe annidate e lascia intatto il resto", () => {
    expect(redactDeep({ a: { b: [`x?access_token=${SK}`, 3, null] }, n: 5 })).toEqual({
      a: { b: ["x?access_token=[REDACTED]", 3, null] },
      n: 5,
    });
  });

  it("serializza un errore con messaggio, stack e causa ripuliti", () => {
    const error = new Error(`boom ${SK}`, { cause: new Error(`causa access_token=${SK}`) });
    const text = JSON.stringify(serializeError(error));
    expect(text).not.toContain("firma_Segreta");
    expect(text).toContain("boom");
    expect(text).toContain("causa");
  });

  it("accetta valori che non sono errori", () => {
    expect(serializeError(`stringa con ${SK}`).message).not.toContain("firma_Segreta");
  });
});
