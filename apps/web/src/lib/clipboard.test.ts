import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./clipboard";

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
  vi.restoreAllMocks();
});

describe("copyText", () => {
  it("usa la Clipboard API", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    expect(await copyText("Via Roma 1")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("Via Roma 1");
  });

  it("se la Clipboard API rifiuta ricade su execCommand", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("negato")) }, configurable: true });
    document.execCommand = vi.fn().mockReturnValue(true);
    expect(await copyText("Via Roma 1")).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull(); // il campo temporaneo viene rimosso
  });

  it("senza alcun metodo disponibile restituisce false", async () => {
    document.execCommand = vi.fn().mockReturnValue(false);
    expect(await copyText("x")).toBe(false);
  });
});
