import { describe, it, expect } from "bun:test";
import { parseLeadingNumber } from "./parseDose";

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
});
