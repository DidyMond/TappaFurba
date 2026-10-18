import { describe, expect, it } from "vitest";
import { isPriceFresh, lastConfirmedAt } from "../src/pricing/freshness";

const NOW = new Date("2026-10-09T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

describe("lastConfirmedAt — ultima conferma della fonte", () => {
  it("senza riquadro aggiornato vale la data di comunicazione", () => {
    expect(lastConfirmedAt(hoursAgo(100)).getTime()).toBe(hoursAgo(100).getTime());
    expect(lastConfirmedAt(hoursAgo(100), null).getTime()).toBe(hoursAgo(100).getTime());
    expect(lastConfirmedAt(hoursAgo(100), undefined).getTime()).toBe(hoursAgo(100).getTime());
  });

  it("con un riquadro aggiornato più di recente vale l'aggiornamento del riquadro", () => {
    expect(lastConfirmedAt(hoursAgo(100), hoursAgo(1)).getTime()).toBe(hoursAgo(1).getTime());
  });

  it("se il prezzo è stato comunicato DOPO l'ultimo aggiornamento del riquadro vale la comunicazione", () => {
    expect(lastConfirmedAt(hoursAgo(2), hoursAgo(50)).getTime()).toBe(hoursAgo(2).getTime());
  });

  it("accetta Date, ISO 8601 e millisecondi", () => {
    expect(lastConfirmedAt(hoursAgo(100).toISOString(), hoursAgo(1).getTime()).getTime()).toBe(hoursAgo(1).getTime());
  });
});

describe("isPriceFresh — soglia di freschezza (72 h di fabbrica)", () => {
  it("prezzo comunicato entro la soglia: fresco, con o senza riquadro", () => {
    expect(isPriceFresh(hoursAgo(10), null, NOW, 72)).toBe(true);
    expect(isPriceFresh(hoursAgo(10), hoursAgo(500), NOW, 72)).toBe(true);
  });

  it("prezzo vecchio in un riquadro appena aggiornato: FRESCO (la fonte lo ha confermato)", () => {
    expect(isPriceFresh(hoursAgo(120), hoursAgo(0.2), NOW, 72)).toBe(true);
  });

  it("lo stesso prezzo vecchio in un riquadro non aggiornato (o mai interrogato): NON fresco", () => {
    expect(isPriceFresh(hoursAgo(120), null, NOW, 72)).toBe(false);
    expect(isPriceFresh(hoursAgo(120), undefined, NOW, 72)).toBe(false);
  });

  it("un riquadro aggiornato prima della soglia non aiuta: conta come se non ci fosse", () => {
    expect(isPriceFresh(hoursAgo(120), hoursAgo(80), NOW, 72)).toBe(false);
  });

  it("il confine è inclusivo (esattamente alla soglia è ancora fresco) e segue la soglia scelta dall'utente", () => {
    expect(isPriceFresh(hoursAgo(72), null, NOW, 72)).toBe(true);
    expect(isPriceFresh(hoursAgo(72.01), null, NOW, 72)).toBe(false);
    expect(isPriceFresh(hoursAgo(100), hoursAgo(100), NOW, 120)).toBe(true);
    expect(isPriceFresh(hoursAgo(100), hoursAgo(100), NOW, 24)).toBe(false);
  });
});
