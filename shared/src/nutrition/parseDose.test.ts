import { describe, it, expect } from "bun:test";
import { parseLeadingNumber, parseCountableDose, formatCountableDose } from "./parseDose";

describe("parseLeadingNumber", () => {
  it("extrae el número de una dosis en unidades", () => {
    expect(parseLeadingNumber("1 cápsula")).toBe(1);
    expect(parseLeadingNumber("3 comprimidos")).toBe(3);
  });
  it("acepta coma decimal (es-AR) y punto", () => {
    expect(parseLeadingNumber("1,5 g")).toBe(1.5);
    expect(parseLeadingNumber("0.5 scoop")).toBe(0.5);
  });
  it("null cuando no hay número", () => {
    expect(parseLeadingNumber("según necesidad")).toBeNull();
    expect(parseLeadingNumber("")).toBeNull();
    expect(parseLeadingNumber(null)).toBeNull();
    expect(parseLeadingNumber(undefined)).toBeNull();
  });
  it("clampa negativos a 0", () => {
    expect(parseLeadingNumber("-2 caps")).toBe(0);
  });
  it("acepta decimales sin cero inicial (punto o coma)", () => {
    expect(parseLeadingNumber(".5 cápsula")).toBe(0.5);
    expect(parseLeadingNumber(",5 g")).toBe(0.5);
  });
});

describe("parseCountableDose", () => {
  it("detecta dosis contables (entero + unidad conocida)", () => {
    expect(parseCountableDose("3 cápsulas")).toEqual({ count: 3, unit: "cápsula" });
    expect(parseCountableDose("1 comprimido")).toEqual({ count: 1, unit: "comprimido" });
    expect(parseCountableDose("2 pastillas")).toEqual({ count: 2, unit: "pastilla" });
    expect(parseCountableDose("1 tableta")).toEqual({ count: 1, unit: "tableta" });
    expect(parseCountableDose("2 gomitas")).toEqual({ count: 2, unit: "gomita" });
    expect(parseCountableDose("3 perlas")).toEqual({ count: 3, unit: "perla" });
    expect(parseCountableDose("1 gragea")).toEqual({ count: 1, unit: "gragea" });
    expect(parseCountableDose("4 unidades")).toEqual({ count: 4, unit: "unidad" });
  });
  it("ignora mayúsculas y acentos en la unidad", () => {
    expect(parseCountableDose("3 CAPSULAS")).toEqual({ count: 3, unit: "cápsula" });
    expect(parseCountableDose("1 Cápsula")).toEqual({ count: 1, unit: "cápsula" });
    expect(parseCountableDose("2 capsulas")).toEqual({ count: 2, unit: "cápsula" });
    expect(parseCountableDose("  5   Comprimidos  ")).toEqual({ count: 5, unit: "comprimido" });
  });
  it("null para dosis de peso/volumen (no contables)", () => {
    expect(parseCountableDose("10 g")).toBeNull();
    expect(parseCountableDose("5 ml")).toBeNull();
    expect(parseCountableDose("200 mg")).toBeNull();
    expect(parseCountableDose("1 scoop de polvo")).toBeNull();
  });
  it("null cuando no hay número o no es entero", () => {
    expect(parseCountableDose("según necesidad")).toBeNull();
    expect(parseCountableDose("1,5 cápsulas")).toBeNull();
    expect(parseCountableDose("0.5 cápsula")).toBeNull();
    expect(parseCountableDose("")).toBeNull();
    expect(parseCountableDose(null)).toBeNull();
    expect(parseCountableDose(undefined)).toBeNull();
  });
  it("null cuando hay texto extra pegado a la unidad", () => {
    expect(parseCountableDose("2 cápsulas grandes")).toBeNull();
    expect(parseCountableDose("3 tabletas efervescentes")).toBeNull();
  });
  it("acepta el entero 0", () => {
    expect(parseCountableDose("0 cápsulas")).toEqual({ count: 0, unit: "cápsula" });
  });
});

describe("formatCountableDose", () => {
  it("singular con count === 1, plural en el resto", () => {
    expect(formatCountableDose(1, "cápsula")).toBe("1 cápsula");
    expect(formatCountableDose(3, "cápsula")).toBe("3 cápsulas");
    expect(formatCountableDose(0, "cápsula")).toBe("0 cápsulas");
    expect(formatCountableDose(1, "comprimido")).toBe("1 comprimido");
    expect(formatCountableDose(2, "comprimido")).toBe("2 comprimidos");
    expect(formatCountableDose(4, "unidad")).toBe("4 unidades");
    expect(formatCountableDose(1, "unidad")).toBe("1 unidad");
  });
  it("round-trip con parseCountableDose reconstruye la dosis original", () => {
    const parsed = parseCountableDose("3 cápsulas");
    expect(parsed).not.toBeNull();
    expect(formatCountableDose(parsed!.count, parsed!.unit)).toBe("3 cápsulas");
  });
  it("fallback: unidad desconocida se emite tal cual", () => {
    expect(formatCountableDose(2, "sobre")).toBe("2 sobre");
  });
});
