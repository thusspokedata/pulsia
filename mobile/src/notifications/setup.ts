import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { REST_CHANNEL_ID } from "../session/restNotification";

// Setup único (al montar el layout raíz). El handler solo corre cuando llega una notif con
// la app en FOREGROUND: ahí se suprime el sonido porque la campana JS (expo-audio) ya lo
// maneja → evita la doble campana. En background el handler no corre y el sonido lo pone
// el OS vía el canal.
export async function setupRestNotifications(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: false,
      shouldShowList: false,
    }),
  });
  try {
    await Notifications.requestPermissionsAsync();
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(REST_CHANNEL_ID, {
        name: "Fin de descanso",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "bell.wav",
      });
    }
  } catch {
    // Permiso/canal best-effort: si falla, queda la campana solo-foreground (comportamiento previo).
  }
}
