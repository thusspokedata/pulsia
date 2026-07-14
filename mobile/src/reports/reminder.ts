import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_ID = "pulsia.reportReminderId";
const KEY_TIME = "pulsia.reportReminderTime"; // "HH:MM"
export const DEFAULT_TIME = "21:30";

export async function getReminderTime(): Promise<string> {
  return (await AsyncStorage.getItem(KEY_TIME)) ?? DEFAULT_TIME;
}

export async function cancelDailyReport(): Promise<void> {
  const id = await AsyncStorage.getItem(KEY_ID);
  if (id) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      /* ya no existe */
    }
    await AsyncStorage.removeItem(KEY_ID);
  }
}

// Programa (o reprograma) una notif LOCAL diaria a la hora dada. Cancela la previa.
export async function scheduleDailyReport(time: string): Promise<void> {
  await cancelDailyReport();
  const [h, m] = time.split(":").map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return;
  const id = await Notifications.scheduleNotificationAsync({
    content: { title: "Tu resumen del día 📋", body: "Mirá cómo te fue hoy y los consejos del agente." },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: h, minute: m },
  });
  await AsyncStorage.setItem(KEY_ID, id);
  await AsyncStorage.setItem(KEY_TIME, time);
}
