import { test, expect } from "bun:test";
import { buildMemoryUpdatePrompt } from "./memory";

test("incluye la memoria previa y el historial", () => {
  const p = buildMemoryUpdatePrompt("no tiene barra", "2026-07-01 — Día 1 (gym)\n  - Bench: 40×10@8");
  expect(p).toContain("no tiene barra");
  expect(p).toContain("40×10@8");
  expect(p.toLowerCase()).toContain("memoria");
});

test("memoria previa vacía → no rompe", () => {
  const p = buildMemoryUpdatePrompt("", "");
  expect(typeof p).toBe("string");
  expect(p.length).toBeGreaterThan(0);
});
