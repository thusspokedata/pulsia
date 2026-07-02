// mobile/__tests__/paired-band-storage.test.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getPairedBand, setPairedBand, clearPairedBand } from "../src/storage/pairedBand";

beforeEach(async () => { await AsyncStorage.clear(); });

test("set/get/clear de la banda emparejada", async () => {
  expect(await getPairedBand()).toBeNull();
  await setPairedBand({ deviceId: "AA:BB:CC", name: "Polar H10" });
  expect(await getPairedBand()).toEqual({ deviceId: "AA:BB:CC", name: "Polar H10" });
  await clearPairedBand();
  expect(await getPairedBand()).toBeNull();
});

test("getPairedBand devuelve null si el guardado es inválido", async () => {
  await AsyncStorage.setItem("pulsia.pairedBand", "{ not json");
  expect(await getPairedBand()).toBeNull();
});
