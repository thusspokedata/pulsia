import { cardioHrPoints } from "../src/cardio/hrPoints";

test("con samples.t/hr → arma los puntos desde samples (filtra nulls), ignora hrSeries", () => {
  const a = {
    samples: { t: [0, 1000, 2000], hr: [100, null, 110] },
    hrSeries: [{ t: 0, bpm: 999 }],
  };
  expect(cardioHrPoints(a)).toEqual([
    { t: 0, bpm: 100 },
    { t: 2000, bpm: 110 },
  ]);
});

test("sin samples → cae a hrSeries", () => {
  const a = { hrSeries: [{ t: 0, bpm: 90 }, { t: 5000, bpm: 95 }] };
  expect(cardioHrPoints(a)).toEqual(a.hrSeries);
});

test("samples sin canal hr → cae a hrSeries", () => {
  const a = { samples: { t: [0, 1000] }, hrSeries: [{ t: 0, bpm: 88 }] };
  expect(cardioHrPoints(a)).toEqual([{ t: 0, bpm: 88 }]);
});

test("samples con el canal hr todo en null (fila del backfill de la migración 0021 que no pudo completar) → cae a hrSeries", () => {
  const a = { samples: { t: [0, 1000], hr: [null, null] }, hrSeries: [{ t: 0, bpm: 77 }] };
  expect(cardioHrPoints(a)).toEqual([{ t: 0, bpm: 77 }]);
});

test("ni samples ni hrSeries → []", () => {
  expect(cardioHrPoints({})).toEqual([]);
});
