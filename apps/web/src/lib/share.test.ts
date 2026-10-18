import { afterEach, describe, expect, it, vi } from "vitest";
import { shareStation } from "./share";

const payload = { title: "Stazione", text: "Stazione · Benzina Self €1,990/L", url: "https://www.google.com/maps/dir/?api=1&destination=1,2" };

afterEach(() => {
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "clipboard");
  vi.restoreAllMocks();
});

describe("shareStation", () => {
  it("con la Web Share API condivide il payload", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    expect(await shareStation(payload)).toBe("shared");
    expect(share).toHaveBeenCalledWith(payload);
  });

  it("l'utente che chiude il foglio non è un errore", async () => {
    Object.defineProperty(navigator, "share", { value: vi.fn().mockRejectedValue(new DOMException("annullato", "AbortError")), configurable: true });
    expect(await shareStation(payload)).toBe("cancelled");
  });

  it("senza Web Share API copia testo e link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    expect(await shareStation(payload)).toBe("copied");
    expect(writeText).toHaveBeenCalledWith(`${payload.text}\n${payload.url}`);
  });

  it("se la condivisione fallisce per altro motivo prova la copia; se anche questa fallisce lo dichiara", async () => {
    Object.defineProperty(navigator, "share", { value: vi.fn().mockRejectedValue(new Error("permesso")), configurable: true });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
    expect(await shareStation(payload)).toBe("copied");

    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("no")) }, configurable: true });
    document.execCommand = vi.fn().mockReturnValue(false);
    expect(await shareStation(payload)).toBe("failed");
  });
});
