const mockSetHandler = jest.fn();
const mockRequestPerms = jest.fn(async (..._a: any[]) => ({ status: "granted" }));
const mockSetChannel = jest.fn(async (..._a: any[]) => undefined);
jest.mock("expo-notifications", () => ({
  setNotificationHandler: (...a: any[]) => mockSetHandler(...a),
  requestPermissionsAsync: (...a: any[]) => mockRequestPerms(...a),
  setNotificationChannelAsync: (...a: any[]) => mockSetChannel(...a),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

import { Platform } from "react-native";
// El canal Android solo se crea con Platform.OS === "android"; el preset por defecto es ios.
Object.defineProperty(Platform, "OS", { value: "android", configurable: true });

import { setupRestNotifications } from "../src/notifications/setup";

beforeEach(() => {
  mockSetHandler.mockClear();
  mockRequestPerms.mockClear();
  mockSetChannel.mockClear();
});

test("fija el handler que suprime el sonido en foreground", async () => {
  await setupRestNotifications();
  expect(mockSetHandler).toHaveBeenCalledTimes(1);
  const handler = mockSetHandler.mock.calls[0][0].handleNotification;
  await expect(handler()).resolves.toMatchObject({ shouldPlaySound: false });
});

test("pide permiso y crea el canal 'rest-bell' con el sonido", async () => {
  await setupRestNotifications();
  expect(mockRequestPerms).toHaveBeenCalled();
  const [id, cfg] = mockSetChannel.mock.calls[0];
  expect(id).toBe("rest-bell");
  expect(cfg.sound).toBe("bell.wav");
});
