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
