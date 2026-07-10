import { parsePlannedReps } from "../src/session/plannedReps";

test("extrae el número inicial de un rango (\"8-10\" → 8)", () => {
  expect(parsePlannedReps("8-10")).toBe(8);
});

test("un número simple se parsea tal cual (\"10\" → 10)", () => {
  expect(parsePlannedReps("10")).toBe(10);
});

test("ignora texto después del número (\"12 reps\" → 12)", () => {
  expect(parsePlannedReps("12 reps")).toBe(12);
});

test("texto sin número al inicio devuelve 0 (\"AMRAP\" → 0)", () => {
  expect(parsePlannedReps("AMRAP")).toBe(0);
});

test("string vacío devuelve 0", () => {
  expect(parsePlannedReps("")).toBe(0);
});

test("texto no numérico devuelve 0", () => {
  expect(parsePlannedReps("máximo posible")).toBe(0);
});
