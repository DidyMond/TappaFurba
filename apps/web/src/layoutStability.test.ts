import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "index.css"), "utf8");

describe("stabilità del layout con la barra di scorrimento", () => {
  it("html riserva sempre lo spazio della barra (scrollbar-gutter: stable): il blocco dello scorrimento dei fogli non ricentra header e barra inferiore", () => {
    expect(css).toMatch(/html\s*\{[^}]*scrollbar-gutter:\s*stable/);
  });

  it("html e body non usano `width: 100vw` (include la barra e crea uno scorrimento orizzontale che sposta gli elementi fissi)", () => {
    expect(css).not.toMatch(/width:\s*100vw/);
    expect(css).toMatch(/html,\s*body\s*\{[^}]*width:\s*100%/);
  });
});
