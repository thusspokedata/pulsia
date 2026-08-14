import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSupplementsCollapsed, setSupplementsCollapsed } from "./supplementsCollapsed";

beforeEach(async () => {
  await AsyncStorage.clear();
});

test("por defecto la card está colapsada (sin valor guardado)", async () => {
  expect(await getSupplementsCollapsed()).toBe(true);
});

test("guarda y recupera el estado expandido", async () => {
  await setSupplementsCollapsed(false);
  expect(await getSupplementsCollapsed()).toBe(false);
});

test("guarda y recupera el estado colapsado", async () => {
  await setSupplementsCollapsed(true);
  expect(await getSupplementsCollapsed()).toBe(true);
});

test("un valor corrupto cae al default colapsado", async () => {
  await AsyncStorage.setItem("pulsia.supplementsCollapsed", "xyz");
  expect(await getSupplementsCollapsed()).toBe(true);
});
