import * as Notifications from "expo-notifications";

export const REST_CHANNEL_ID = "rest-bell";
const BELL_SOUND = "bell.wav";

export type RestNotificationPlan = { schedule: false } | { schedule: true; date: number };

// Decisión pura: ¿programar una notif para el fin del descanso? Solo si hay un descanso
// futuro y los sonidos están habilitados. `date` es el timestamp absoluto (ms) del fin.
export function restNotificationPlan(args: {
  restUntil: number | null;
  soundsEnabled: boolean;
  now: number;
}): RestNotificationPlan {
  const { restUntil, soundsEnabled, now } = args;
  if (!soundsEnabled || restUntil == null || restUntil <= now) return { schedule: false };
  return { schedule: true, date: restUntil };
}

// Wrapper con efectos: programa la campana de fin de descanso y devuelve su id.
export async function scheduleRestBell(date: number): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: { title: "Descanso terminado", body: "¡Dale con la próxima serie!", sound: BELL_SOUND },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(date),
      channelId: REST_CHANNEL_ID,
    },
  });
}

export async function cancelRestBell(id: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(id);
}
