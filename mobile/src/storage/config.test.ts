import AsyncStorage from "@react-native-async-storage/async-storage";
import { getBackendUrl, setBackendUrl } from "./config";

beforeEach(async () => {
  await AsyncStorage.clear();
});

test("devuelve null si no hay URL guardada", async () => {
  expect(await getBackendUrl()).toBeNull();
});

test("guarda y recupera la URL", async () => {
  await setBackendUrl("http://192.168.1.50:8787");
  expect(await getBackendUrl()).toBe("http://192.168.1.50:8787");
});
