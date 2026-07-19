import { test, expect } from "bun:test";
import { splitCsvLine, parseUnitNumber, parse12hTime, localEpoch, localNoonEpoch } from "./csvUtils";

test("splitCsvLine respeta comillas con comas adentro", () => {
  expect(splitCsvLine('" Jul 18, 2026",')).toEqual(["Jul 18, 2026", ""]);
  expect(splitCsvLine("8:28 AM,80.0 kg,0.5 kg,")).toEqual(["8:28 AM", "80.0 kg", "0.5 kg", ""]);
});

test("parseUnitNumber saca la unidad pegada", () => {
  expect(parseUnitNumber("80.0 kg")).toBe(80.0);
  expect(parseUnitNumber("18.0 %")).toBe(18.0);
  expect(parseUnitNumber("25.0")).toBe(25.0);
  expect(parseUnitNumber("")).toBeNull();
  expect(parseUnitNumber("Good")).toBeNull();
});

test("parse12hTime convierte 12h a 24h", () => {
  expect(parse12hTime("8:28 AM")).toEqual({ h: 8, mi: 28 });
  expect(parse12hTime("1:05 PM")).toEqual({ h: 13, mi: 5 });
  expect(parse12hTime("12:27 PM")).toEqual({ h: 12, mi: 27 });
  expect(parse12hTime("12:05 AM")).toEqual({ h: 0, mi: 5 });
  expect(parse12hTime("basura")).toBeNull();
});

test("localNoonEpoch usa el offset del cliente (Berlín CEST = -120)", () => {
  expect(localNoonEpoch(2026, 7, 17, -120)).toBe(Date.UTC(2026, 6, 17, 10, 0, 0));
  expect(localNoonEpoch(2026, 7, 17, 0)).toBe(Date.UTC(2026, 6, 17, 12, 0, 0));
});

test("localEpoch arma un instante real", () => {
  expect(localEpoch(2026, 7, 18, 8, 28, -120)).toBe(Date.UTC(2026, 6, 18, 6, 28, 0));
});
