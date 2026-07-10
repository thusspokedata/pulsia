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
