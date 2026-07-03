import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSoundsEnabled, setSoundsEnabled } from "../src/storage/sounds";

beforeEach(async () => {
  await AsyncStorage.clear();
});

test("por defecto (sin nada guardado) los sonidos están habilitados", async () => {
  expect(await getSoundsEnabled()).toBe(true);
});

test("guarda y recupera el estado deshabilitado", async () => {
  await setSoundsEnabled(false);
  expect(await getSoundsEnabled()).toBe(false);
  expect(await AsyncStorage.getItem("pulsia.soundsEnabled")).toBe("0");
});

test("guarda y recupera el estado habilitado", async () => {
  await setSoundsEnabled(true);
  expect(await getSoundsEnabled()).toBe(true);
  expect(await AsyncStorage.getItem("pulsia.soundsEnabled")).toBe("1");
});
