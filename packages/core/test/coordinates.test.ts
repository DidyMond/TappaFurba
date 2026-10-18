import { describe, expect, it } from "vitest";
import { isValidItalianCoordinate } from "../src/validation/coordinates";

describe("isValidItalianCoordinate", () => {
  it("accetta le coordinate minime e massime reali osservate nel dataset MIMIT", () => {
    expect(isValidItalianCoordinate(35.499734, 13.5)).toBe(true);
    expect(isValidItalianCoordinate(46.946944, 18.496371)).toBe(true);
    expect(isValidItalianCoordinate(37.333935, 13.595533)).toBe(true);
  });

  it("rifiuta coordinate NaN", () => {
    expect(isValidItalianCoordinate(Number.NaN, 13.5)).toBe(false);
    expect(isValidItalianCoordinate(45, Number.NaN)).toBe(false);
  });

  it("rifiuta il placeholder classico (0,0) di un geocoding fallito a monte", () => {
    expect(isValidItalianCoordinate(0, 0)).toBe(false);
  });

  it("rifiuta coordinate fuori dal bounding box italiano", () => {
    expect(isValidItalianCoordinate(51.5074, -0.1278)).toBe(false); // Londra
    expect(isValidItalianCoordinate(90, 0)).toBe(false); // Polo Nord
  });
});
