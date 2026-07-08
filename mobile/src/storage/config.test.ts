import AsyncStorage from "@react-native-async-storage/async-storage";
import { getBackendUrl, setBackendUrl } from "./config";
import { DEFAULT_BACKEND_URL } from "../config/backend";

beforeEach(async () => {
  await AsyncStorage.clear();
});

test("devuelve la URL por defecto si no hay URL guardada", async () => {
  expect(await getBackendUrl()).toBe(DEFAULT_BACKEND_URL);
});

test("guarda y recupera la URL", async () => {
  await setBackendUrl("http://192.168.1.50:8787");
  expect(await getBackendUrl()).toBe("http://192.168.1.50:8787");
});
