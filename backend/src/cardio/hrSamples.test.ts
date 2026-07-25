import { test, expect } from "bun:test";
import { extractHrSamples } from "./hrSamples";

const rec = (tMs: number, hr: number | null) => ({ timestamp: new Date(tMs), heartRate: hr });

test("extractHrSamples toma los records con FC y timestamp, en epoch absoluto", () => {
  const messages = { recordMesgs: [rec(1000, 120), rec(2000, 130)] };
  expect(extractHrSamples(messages)).toEqual([{ tMs: 1000, bpm: 120 }, { tMs: 2000, bpm: 130 }]);
});

test("descarta records sin heartRate o sin timestamp válido", () => {
  const messages = { recordMesgs: [rec(1000, 120), rec(2000, null), { heartRate: 140 }] };
  expect(extractHrSamples(messages)).toEqual([{ tMs: 1000, bpm: 120 }]);
});

test("redondea la FC y tolera recordMesgs ausente", () => {
  expect(extractHrSamples({ recordMesgs: [rec(1000, 122.7)] })).toEqual([{ tMs: 1000, bpm: 123 }]);
  expect(extractHrSamples({})).toEqual([]);
});

test("descarta FC no-finita (NaN/Infinity) y timestamps inválidos (new Date(NaN))", () => {
  const messages = { recordMesgs: [
    rec(1000, 120),                          // válido
    { timestamp: new Date(2000), heartRate: NaN },       // FC NaN → fuera
    { timestamp: new Date(3000), heartRate: Infinity },  // FC Infinity → fuera
    { timestamp: new Date(NaN), heartRate: 130 },        // fecha inválida → fuera
  ] };
  expect(extractHrSamples(messages)).toEqual([{ tMs: 1000, bpm: 120 }]);
});

import { hrForInterval, downsampleHrSeries } from "./hrSamples";

test("hrForInterval promedia y saca el máximo de los samples del intervalo [start,end]", () => {
  const s = [{ tMs: 100, bpm: 100 }, { tMs: 200, bpm: 120 }, { tMs: 300, bpm: 140 }, { tMs: 999, bpm: 200 }];
  // intervalo [100,300]: 100,120,140 → avg 120, max 140. El de 999 queda afuera.
  expect(hrForInterval(s, 100, 300)).toEqual({ avg: 120, max: 140 });
});

test("hrForInterval sin samples en el intervalo da null/null", () => {
  expect(hrForInterval([{ tMs: 100, bpm: 100 }], 500, 600)).toEqual({ avg: null, max: null });
});

test("downsampleHrSeries agrupa en buckets, promedia y hace t relativo al inicio de la sesión", () => {
  // startedAt 1000, bucket 5000ms. Sample a 1000 (t=0, bucket 0), 4000 (t=3000, bucket 0), 7000 (t=6000, bucket 5000).
  const s = [{ tMs: 1000, bpm: 100 }, { tMs: 4000, bpm: 120 }, { tMs: 7000, bpm: 150 }];
  expect(downsampleHrSeries(s, 1000, 5000)).toEqual([{ t: 0, bpm: 110 }, { t: 5000, bpm: 150 }]);
});

test("downsampleHrSeries descarta samples anteriores al inicio (t<0)", () => {
  expect(downsampleHrSeries([{ tMs: 500, bpm: 100 }, { tMs: 1000, bpm: 130 }], 1000, 5000)).toEqual([{ t: 0, bpm: 130 }]);
});
