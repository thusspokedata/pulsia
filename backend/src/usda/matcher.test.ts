import { expect, test } from "bun:test";
import { rankCandidates } from "./matcher";

const row = (fdcId: number, dataType: string, description: string, similarity: number) =>
  ({ fdcId, dataType, description, similarity }) as never;

test("ante similitud pareja, Foundation le gana a SR Legacy y ambos a Survey", () => {
  // Los fdcId se eligen a PROPÓSITO en orden inverso a la prioridad de tipo (survey=10 <
  // foundation=20 < sr_legacy=30). Así, si el bonus por tipo desaparece, el único criterio que
  // queda es el desempate por fdcId y el orden saldría [10, 20, 30] ≠ [20, 30, 10]: el test cae.
  // Con fdcId en el mismo orden que la prioridad, borrar el bonus entero pasaría desapercibido.
  const out = rankCandidates([
    row(10, "survey", "Egg, fried", 0.8),
    row(20, "foundation", "Egg, whole, raw", 0.8),
    row(30, "sr_legacy", "Egg, whole, cooked", 0.8),
  ]);
  expect(out.map((c) => c.fdcId)).toEqual([20, 30, 10]);
});

test("una similitud MUCHO mejor le gana a la prioridad de tipo", () => {
  const out = rankCandidates([
    row(1, "foundation", "Milk, whole", 0.2),
    row(2, "survey", "Egg, fried", 0.95),
  ]);
  expect(out[0].fdcId).toBe(2);
});

test("devuelve como maximo 8 candidatos", () => {
  const many = Array.from({ length: 20 }, (_, i) => row(i, "sr_legacy", `Food ${i}`, 0.5));
  expect(rankCandidates(many).length).toBe(8);
});

test("sin candidatos devuelve lista vacia, no error", () => {
  expect(rankCandidates([])).toEqual([]);
});
