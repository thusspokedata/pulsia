import AsyncStorage from "@react-native-async-storage/async-storage";
import { getRestState, setRestState, clearRestState } from "../src/storage/restState";

beforeEach(async () => {
  await AsyncStorage.clear();
});

test("sin nada guardado devuelve null", async () => {
  expect(await getRestState()).toBeNull();
});

test("guarda y recupera el estado (con descanso activo)", async () => {
  await setRestState({ sessionId: "s1", setStart: 1_000_000, restUntil: 1_090_000, restRemaining: null });
  expect(await getRestState()).toEqual({
    sessionId: "s1",
    setStart: 1_000_000,
    restUntil: 1_090_000,
    restRemaining: null,
  });
});

test("guarda y recupera el estado (sin descanso, restUntil null)", async () => {
  await setRestState({ sessionId: "s1", setStart: 1_000_000, restUntil: null, restRemaining: null });
  expect(await getRestState()).toEqual({
    sessionId: "s1",
    setStart: 1_000_000,
    restUntil: null,
    restRemaining: null,
  });
});

test("clear borra el estado guardado", async () => {
  await setRestState({ sessionId: "s1", setStart: 1_000_000, restUntil: null, restRemaining: null });
  await clearRestState();
  expect(await getRestState()).toBeNull();
});

test("guarda y recupera el remanente de descanso congelado (restRemaining número)", async () => {
  await setRestState({ sessionId: "s1", setStart: 1_000_000, restUntil: null, restRemaining: 60_000 });
  expect(await getRestState()).toEqual({
    sessionId: "s1",
    setStart: 1_000_000,
    restUntil: null,
    restRemaining: 60_000,
  });
});

test("get devuelve null si restRemaining tiene tipo inesperado", async () => {
  await AsyncStorage.setItem(
    "pulsia.restState",
    JSON.stringify({ sessionId: "s1", setStart: 1_000_000, restUntil: null, restRemaining: "x" }),
  );
  expect(await getRestState()).toBeNull();
});

test("get devuelve null si el JSON es inválido", async () => {
  await AsyncStorage.setItem("pulsia.restState", "{no es json");
  expect(await getRestState()).toBeNull();
});

test("get devuelve null si el JSON no tiene la forma esperada", async () => {
  await AsyncStorage.setItem("pulsia.restState", JSON.stringify({ sessionId: 1, setStart: "x" }));
  expect(await getRestState()).toBeNull();
});
