import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import config from "../tailwind.config";

describe("token tipografico headline-2xl (DESIGN.md è la fonte)", () => {
  const design = readFileSync(join(__dirname, "../../../DESIGN.md"), "utf8");
  it("48/56, peso 800, tracking -0.03em, sia in DESIGN.md sia nella configurazione Tailwind", () => {
    expect(design).toMatch(/headline-2xl:\s*\r?\n\s+fontFamily: Plus Jakarta Sans\s*\r?\n\s+fontSize: 48px\s*\r?\n\s+fontWeight: '800'\s*\r?\n\s+lineHeight: 56px\s*\r?\n\s+letterSpacing: -0\.03em/);
    const sizes = (config.theme?.extend?.fontSize ?? {}) as Record<string, [string, Record<string, string>]>;
    expect(sizes["headline-2xl"]).toEqual(["48px", { lineHeight: "56px", letterSpacing: "-0.03em", fontWeight: "800" }]);
    expect((config.theme?.extend?.fontFamily as Record<string, string[]>)["headline-2xl"]).toEqual(["Plus Jakarta Sans", "sans-serif"]);
  });
});
