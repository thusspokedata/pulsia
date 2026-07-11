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
  // Permiso y canal son best-effort e INDEPENDIENTES: si el permiso tira (raro, pero pasa en
  // algunos OEMs) igual queremos crear el canal, y viceversa. Si algo falla, queda la campana
  // solo-foreground (comportamiento previo).
  try {
    await Notifications.requestPermissionsAsync();
  } catch {
    // permiso best-effort
  }
  if (Platform.OS === "android") {
    try {
      await Notifications.setNotificationChannelAsync(REST_CHANNEL_ID, {
        name: "Fin de descanso",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "bell.wav",
      });
    } catch {
      // canal best-effort
    }
  }
}
