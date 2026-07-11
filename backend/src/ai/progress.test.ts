import { expect, test } from "bun:test";
import type { BodyMetric, WorkoutSession } from "@pulsia/shared";
import { buildProgressSummary } from "./progress";

const NOW = 60 * 24 * 60 * 60 * 1000; // 60 días en ms, como "ahora"
const day = 24 * 60 * 60 * 1000;

test("sin datos → string vacío (no rompe el prompt)", () => {
  expect(buildProgressSummary({ metrics: [], sessions: [], heightCm: null, nowMs: NOW })).toBe("");
});

test("incluye delta de peso e IMC derivado cuando hay altura", () => {
  const metrics: BodyMetric[] = [
    { id: "a", metricType: "weight_kg", value: 82, measuredAt: NOW - 50 * day },
    { id: "b", metricType: "weight_kg", value: 79.5, measuredAt: NOW - 1 * day },
  ];
  const out = buildProgressSummary({ metrics, sessions: [], heightCm: 180, nowMs: NOW });
  expect(out).toContain("Peso");
  expect(out).toContain("82");
  expect(out).toContain("79.5");
  expect(out.toLowerCase()).toContain("imc");
});

test("métricas de flujo: promedio reciente (7 días) y umbrales, no delta", () => {
  const NOW = 1_000 * day;
  const out = buildProgressSummary({
    metrics: [
      { id: "1", metricType: "steps", value: 6000, measuredAt: NOW - 1 * day },
      { id: "2", metricType: "steps", value: 10000, measuredAt: NOW - 2 * day },
      { id: "3", metricType: "sleep_hours", value: 5, measuredAt: NOW - 1 * day },
      { id: "4", metricType: "sleep_hours", value: 8, measuredAt: NOW - 2 * day },
    ],
    sessions: [], heightCm: null, nowMs: NOW,
  });
  expect(out).toContain("Pasos: ~8000");
  expect(out).toContain("1 de 2 días < 8.000");
  expect(out).toContain("1 de 2 noches < 6 h");
});

test("peso: usa el profileWeightKg de fallback cuando no hay medición weight_kg", () => {
  const NOW = 1_000 * day;
  const out = buildProgressSummary({ metrics: [], sessions: [], heightCm: 180, nowMs: NOW, profileWeightKg: 80 });
  expect(out).toContain("80");
});
