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
