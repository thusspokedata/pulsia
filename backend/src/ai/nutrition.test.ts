import { test, expect } from "bun:test";
import { buildFoodPrompt } from "./nutrition";

test("el prompt pide etiqueta-o-estimación, macros por 100 y anti-inyección", () => {
  const p = buildFoodPrompt();
  expect(p).toMatch(/tabla nutricional/i);
  expect(p).toMatch(/estim/i);
  expect(p).toMatch(/100 ?g|100 ?ml|por 100/i);
  expect(p).toMatch(/unitWeightG|peso.*unidad/i);
  expect(p).toMatch(/DATOS|no.*instruc/i); // anti prompt-injection
  expect(p).toMatch(/return_food/);
});

test("el prompt pide micros y la regla de naming condicional", () => {
  const p = buildFoodPrompt();
  // micros
  expect(p).toMatch(/saturated_fat_g/);
  expect(p).toMatch(/sugars_g/);
  expect(p).toMatch(/fiber_g/);
  expect(p).toMatch(/salt_g/);
  expect(p).toMatch(/sodio/i); // nota sal-vs-sodio
  // naming condicional
  expect(p).toMatch(/tal como está impreso|nombre del producto/i);
  expect(p).toMatch(/estimate/); // estimado → español
  // base (sigue)
  expect(p).toMatch(/return_food/);
});

test("el prompt pide colesterol (mg) y aporte de agua", () => {
  const p = buildFoodPrompt();
  expect(p).toMatch(/cholesterol_mg/);
  expect(p).toMatch(/water_ml/);
  expect(p).toMatch(/mg/); // colesterol en mg
  expect(p).toMatch(/agua/i); // aporte de agua
});
