import AsyncStorage from "@react-native-async-storage/async-storage";
import { getWaterGoalOverride, setWaterGoalOverride } from "../src/storage/waterGoal";

beforeEach(async () => { await AsyncStorage.clear(); });

test("por defecto (nada guardado) el override es null", async () => {
  expect(await getWaterGoalOverride()).toBeNull();
});

test("guarda y recupera un override (redondeado)", async () => {
  await setWaterGoalOverride(2450.6);
  expect(await getWaterGoalOverride()).toBe(2451);
  expect(await AsyncStorage.getItem("pulsia.waterGoalOverrideMl")).toBe("2451");
});

test("setWaterGoalOverride(null) borra la clave (vuelve a auto)", async () => {
  await setWaterGoalOverride(3000);
  await setWaterGoalOverride(null);
  expect(await getWaterGoalOverride()).toBeNull();
  expect(await AsyncStorage.getItem("pulsia.waterGoalOverrideMl")).toBeNull();
});

test("un valor <= 0 o inválido no persiste (cae a auto)", async () => {
  await setWaterGoalOverride(0);
  expect(await getWaterGoalOverride()).toBeNull();
  await setWaterGoalOverride(-100);
  expect(await getWaterGoalOverride()).toBeNull();
});

test("un valor corrupto en storage se lee como null", async () => {
  await AsyncStorage.setItem("pulsia.waterGoalOverrideMl", "wat");
  expect(await getWaterGoalOverride()).toBeNull();
});
