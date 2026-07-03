// Usamos el react-native que provee jest-expo (ya trae PermissionsAndroid.RESULTS/
// PERMISSIONS y requestMultiple/request como funciones) y sólo sobreescribimos
// Platform.OS/Version y espiamos las llamadas de permisos.
import { PermissionsAndroid, Platform } from "react-native";
import { ensureBlePermissions } from "../src/ble/permissions";

const G = PermissionsAndroid.RESULTS.GRANTED;
const D = PermissionsAndroid.RESULTS.DENIED;
const SCAN = PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN;
const CONNECT = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT;

let mockRequestMultiple: jest.SpyInstance;
let mockRequest: jest.SpyInstance;

function setPlatform(os: string, version: number | string) {
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });
  Object.defineProperty(Platform, "Version", { value: version, configurable: true });
}

beforeEach(() => {
  setPlatform("android", 31);
  mockRequestMultiple = jest.spyOn(PermissionsAndroid, "requestMultiple");
  mockRequest = jest.spyOn(PermissionsAndroid, "request");
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("no-android → true sin pedir permisos", async () => {
  setPlatform("ios", "17.0");
  expect(await ensureBlePermissions()).toBe(true);
  expect(mockRequestMultiple).not.toHaveBeenCalled();
  expect(mockRequest).not.toHaveBeenCalled();
});

test("android 31 con ambos GRANTED → true", async () => {
  mockRequestMultiple.mockResolvedValue({ [SCAN]: G, [CONNECT]: G });
  expect(await ensureBlePermissions()).toBe(true);
  expect(mockRequestMultiple).toHaveBeenCalled();
});

test("android 31 con uno DENIED → false", async () => {
  mockRequestMultiple.mockResolvedValue({ [SCAN]: G, [CONNECT]: D });
  expect(await ensureBlePermissions()).toBe(false);
});
