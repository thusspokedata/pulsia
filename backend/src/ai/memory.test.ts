import { test, expect } from "bun:test";
import { buildMemoryUpdatePrompt } from "./memory";

test("incluye la memoria previa y el historial", () => {
  const p = buildMemoryUpdatePrompt("no tiene barra", "2026-07-01 — Día 1 (gym)\n  - Bench: 40×10@8");
  expect(p).toContain("no tiene barra");
  expect(p).toContain("40×10@8");
  // El encabezado, no las otras 2 menciones de "memoria" (rol del sistema e instrucción final).
  expect(p).toContain("Memoria actual del atleta:");
});

test("memoria previa vacía → no rompe", () => {
  const p = buildMemoryUpdatePrompt("", "");
  expect(typeof p).toBe("string");
  expect(p.length).toBeGreaterThan(0);
});
