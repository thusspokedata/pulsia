import * as SecureStore from "expo-secure-store";
import { getToken, clearToken } from "../src/storage/authToken";

// `expo-secure-store` está mockeado globalmente en jest-setup.ts.
const getItemMock = SecureStore.getItemAsync as jest.Mock;
const deleteMock = SecureStore.deleteItemAsync as jest.Mock;

afterEach(() => {
  jest.clearAllMocks();
});

test("getToken devuelve null si SecureStore.getItemAsync rechaza", async () => {
  getItemMock.mockRejectedValueOnce(new Error("keychain no disponible"));
  expect(await getToken()).toBeNull();
});

test("getToken devuelve el token guardado", async () => {
  getItemMock.mockResolvedValueOnce("tok-abc");
  expect(await getToken()).toBe("tok-abc");
});

test("clearToken no propaga si SecureStore.deleteItemAsync rechaza", async () => {
  deleteMock.mockRejectedValueOnce(new Error("keychain no disponible"));
  await expect(clearToken()).resolves.toBeUndefined();
});
