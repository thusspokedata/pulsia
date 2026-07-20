import { channelPoints, CHANNELS } from "../src/cardio/cardioSeries";

const samples = {
  t: [0, 1000, 2000, 3000],
  hr: [100, 110, null, 120],
  cad: [50, 51, 52, 53],
  resp: [null, 15.5, null, 16.0],       // disperso, como en la realidad
  unknown: { "143": [60, 60, 59, 58] }, // Body Battery (inferido)
};

test("channelPoints descarta los huecos y mantiene el pareo t/valor", () => {
  expect(channelPoints({ samples }, "hr")).toEqual([
    { x: 0, y: 100 }, { x: 1000, y: 110 }, { x: 3000, y: 120 },
  ]);
});

test("channelPoints en un canal disperso solo devuelve lo medido (no interpola)", () => {
  expect(channelPoints({ samples }, "resp")).toEqual([{ x: 1000, y: 15.5 }, { x: 3000, y: 16.0 }]);
});

test("channelPoints lee Body Battery del campo desconocido 143", () => {
  expect(channelPoints({ samples }, "bodyBattery")).toEqual([
    { x: 0, y: 60 }, { x: 1000, y: 60 }, { x: 2000, y: 59 }, { x: 3000, y: 58 },
  ]);
});

test("canal ausente o todo-null → vacío (la pantalla no dibuja ese gráfico)", () => {
  expect(channelPoints({ samples: { t: [0, 1], hr: [null, null] } }, "hr")).toEqual([]);
  expect(channelPoints({ samples: { t: [0, 1] } }, "cad")).toEqual([]);
  expect(channelPoints({}, "resp")).toEqual([]);
});

test("hr cae a hrSeries si no hay samples (actividad vieja)", () => {
  expect(channelPoints({ hrSeries: [{ t: 0, bpm: 90 }, { t: 500, bpm: 95 }] }, "hr"))
    .toEqual([{ x: 0, y: 90 }, { x: 500, y: 95 }]);
});

test("el fallback a hrSeries NO aplica a los otros canales", () => {
  expect(channelPoints({ hrSeries: [{ t: 0, bpm: 90 }] }, "cad")).toEqual([]);
});

test("CHANNELS trae label y unidad de cada canal graficable", () => {
  expect(CHANNELS.map((c) => c.key)).toEqual(["hr", "cad", "resp", "bodyBattery"]);
  expect(CHANNELS.find((c) => c.key === "bodyBattery")?.label).toMatch(/inferido/i);
});
