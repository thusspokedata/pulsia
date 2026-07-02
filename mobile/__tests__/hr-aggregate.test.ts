// mobile/__tests__/hr-aggregate.test.ts
import { aggregateHr } from "../src/ble/hrAggregate";

test("sin samples devuelve null/null", () => {
  expect(aggregateHr([])).toEqual({ hrAvg: null, hrMax: null });
});

test("un solo sample: avg y max iguales", () => {
  expect(aggregateHr([{ t: 0, bpm: 70 }])).toEqual({ hrAvg: 70, hrMax: 70 });
});

test("varios samples: avg redondeado y max", () => {
  expect(aggregateHr([
    { t: 0, bpm: 70 },
    { t: 1, bpm: 80 },
    { t: 2, bpm: 75 },
  ])).toEqual({ hrAvg: 75, hrMax: 80 });
});

test("el avg se redondea a entero (half-up)", () => {
  // (70 + 71) / 2 = 70.5 → 71
  expect(aggregateHr([{ t: 0, bpm: 70 }, { t: 1, bpm: 71 }]).hrAvg).toBe(71);
});
