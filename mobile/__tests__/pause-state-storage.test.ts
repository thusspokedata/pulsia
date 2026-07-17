import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getPauseState, setPauseState, clearPauseState,
  isPaused, startPause, endPause, totalPausedMs,
} from "../src/storage/pauseState";

beforeEach(async () => {
  await AsyncStorage.clear();
});

test("sin nada guardado devuelve null", async () => {
  expect(await getPauseState()).toBeNull();
});

test("guarda y recupera el estado con intervalos", async () => {
  await setPauseState({ sessionId: "s1", intervals: [{ startedAt: 100, endedAt: 200 }] });
  expect(await getPauseState()).toEqual({ sessionId: "s1", intervals: [{ startedAt: 100, endedAt: 200 }] });
});

test("guarda y recupera un intervalo abierto (pausa en curso)", async () => {
  await setPauseState({ sessionId: "s1", intervals: [{ startedAt: 100, endedAt: null }] });
  expect(await getPauseState()).toEqual({ sessionId: "s1", intervals: [{ startedAt: 100, endedAt: null }] });
});

test("clear borra el estado guardado", async () => {
  await setPauseState({ sessionId: "s1", intervals: [] });
  await clearPauseState();
  expect(await getPauseState()).toBeNull();
});

test("get devuelve null si el JSON es inválido", async () => {
  await AsyncStorage.setItem("pulsia.pauseState", "{no es json");
  expect(await getPauseState()).toBeNull();
});

test("get devuelve null si el JSON no tiene la forma esperada", async () => {
  await AsyncStorage.setItem("pulsia.pauseState", JSON.stringify({ sessionId: 1, intervals: "x" }));
  expect(await getPauseState()).toBeNull();
});

test("migra el formato viejo con pausa en curso a un intervalo abierto", async () => {
  await AsyncStorage.setItem("pulsia.pauseState", JSON.stringify({ sessionId: "s1", pausedMs: 5000, pausedAt: 1_000_000 }));
  expect(await getPauseState()).toEqual({ sessionId: "s1", intervals: [{ startedAt: 1_000_000, endedAt: null }] });
});

test("migra el formato viejo sin pausa en curso a intervalos vacíos", async () => {
  await AsyncStorage.setItem("pulsia.pauseState", JSON.stringify({ sessionId: "s1", pausedMs: 5000, pausedAt: null }));
  expect(await getPauseState()).toEqual({ sessionId: "s1", intervals: [] });
});

test("get devuelve null si un elemento de intervals es inválido", async () => {
  await AsyncStorage.setItem(
    "pulsia.pauseState",
    JSON.stringify({ sessionId: "s1", intervals: [{ startedAt: 100, endedAt: 200 }, { startedAt: "bad", endedAt: null }] }),
  );
  expect(await getPauseState()).toBeNull();
});

describe("helpers de intervalos", () => {
  test("isPaused: true solo si el último está abierto", () => {
    expect(isPaused([])).toBe(false);
    expect(isPaused([{ startedAt: 100, endedAt: 200 }])).toBe(false);
    expect(isPaused([{ startedAt: 100, endedAt: null }])).toBe(true);
  });
  test("startPause agrega un intervalo abierto", () => {
    expect(startPause([], 500)).toEqual([{ startedAt: 500, endedAt: null }]);
  });
  test("startPause es no-op si ya está pausado", () => {
    const ivs = [{ startedAt: 100, endedAt: null }];
    expect(startPause(ivs, 500)).toEqual(ivs);
  });
  test("endPause cierra el intervalo abierto", () => {
    expect(endPause([{ startedAt: 100, endedAt: null }], 700)).toEqual([{ startedAt: 100, endedAt: 700 }]);
  });
  test("endPause es no-op si no hay intervalo abierto", () => {
    const ivs = [{ startedAt: 100, endedAt: 200 }];
    expect(endPause(ivs, 700)).toEqual(ivs);
  });
  test("totalPausedMs suma cerrados + abierto hasta now", () => {
    expect(totalPausedMs([{ startedAt: 100, endedAt: 300 }, { startedAt: 500, endedAt: null }], 900)).toBe(600); // 200 + 400
  });
});
