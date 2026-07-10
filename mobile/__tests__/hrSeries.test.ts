import { buildHrSeries } from "../src/session/hrSeries";

test("input vacío → []", () => {
  expect(buildHrSeries([], 1000)).toEqual([]);
});

test("samples que caen todos en un mismo bucket → un punto con el promedio redondeado", () => {
  const startedAt = 1000;
  const samples = [
    { t: 1000, bpm: 100 },
    { t: 2000, bpm: 110 },
    { t: 4000, bpm: 105 },
  ];
  const out = buildHrSeries(samples, startedAt);
  expect(out).toEqual([{ t: 0, bpm: 105 }]); // round((100+110+105)/3) = round(105) = 105
});

test("samples que abarcan 2 buckets → 2 puntos con t relativo y promedio por bucket", () => {
  const startedAt = 0;
  const samples = [
    { t: 0, bpm: 100 },
    { t: 4000, bpm: 120 }, // bucket 0: [0, 5000)
    { t: 5000, bpm: 140 },
    { t: 9000, bpm: 160 }, // bucket 1: [5000, 10000)
  ];
  const out = buildHrSeries(samples, startedAt);
  expect(out).toEqual([
    { t: 0, bpm: 110 }, // round((100+120)/2)
    { t: 5000, bpm: 150 }, // round((140+160)/2)
  ]);
});

test("samples con t < startedAt se descartan (no corren el bucket a negativo)", () => {
  const startedAt = 10000;
  const samples = [
    { t: 5000, bpm: 999 }, // antes de startedAt: descartado
    { t: 10000, bpm: 100 },
    { t: 12000, bpm: 110 },
  ];
  const out = buildHrSeries(samples, startedAt);
  expect(out).toEqual([{ t: 0, bpm: 105 }]);
});

test("un sample exactamente en startedAt cae en el bucket 0", () => {
  const startedAt = 2000;
  const out = buildHrSeries([{ t: 2000, bpm: 100 }], startedAt);
  expect(out).toEqual([{ t: 0, bpm: 100 }]);
});

test("los puntos salen ordenados por t ascendente aunque los samples lleguen desordenados", () => {
  const startedAt = 0;
  const samples = [
    { t: 9000, bpm: 160 }, // bucket 1
    { t: 0, bpm: 100 }, // bucket 0
  ];
  const out = buildHrSeries(samples, startedAt);
  expect(out.map((p) => p.t)).toEqual([0, 5000]);
});
