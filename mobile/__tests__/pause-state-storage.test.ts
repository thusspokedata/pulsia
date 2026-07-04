import AsyncStorage from "@react-native-async-storage/async-storage";
import { getPauseState, setPauseState, clearPauseState } from "../src/storage/pauseState";

beforeEach(async () => {
  await AsyncStorage.clear();
});

test("sin nada guardado devuelve null", async () => {
  expect(await getPauseState()).toBeNull();
});

test("guarda y recupera el estado (pausa en curso)", async () => {
  await setPauseState({ sessionId: "s1", pausedMs: 3000, pausedAt: 1_000_000 });
  expect(await getPauseState()).toEqual({ sessionId: "s1", pausedMs: 3000, pausedAt: 1_000_000 });
});

test("guarda y recupera el estado (no pausada, pausedAt null)", async () => {
  await setPauseState({ sessionId: "s1", pausedMs: 3000, pausedAt: null });
  expect(await getPauseState()).toEqual({ sessionId: "s1", pausedMs: 3000, pausedAt: null });
});

test("clear borra el estado guardado", async () => {
  await setPauseState({ sessionId: "s1", pausedMs: 3000, pausedAt: null });
  await clearPauseState();
  expect(await getPauseState()).toBeNull();
});

test("get devuelve null si el JSON es inválido", async () => {
  await AsyncStorage.setItem("pulsia.pauseState", "{no es json");
  expect(await getPauseState()).toBeNull();
});

test("get devuelve null si el JSON no tiene la forma esperada", async () => {
  await AsyncStorage.setItem("pulsia.pauseState", JSON.stringify({ sessionId: 1, pausedMs: "x" }));
  expect(await getPauseState()).toBeNull();
});
