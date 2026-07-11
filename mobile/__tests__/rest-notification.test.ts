import { restNotificationPlan } from "../src/session/restNotification";

const NOW = 1_000_000;

test("descanso futuro con sonidos ON → programar en restUntil", () => {
  expect(restNotificationPlan({ restUntil: NOW + 90_000, soundsEnabled: true, now: NOW })).toEqual({
    schedule: true,
    date: NOW + 90_000,
  });
});

test("sin descanso (null) → no programar", () => {
  expect(restNotificationPlan({ restUntil: null, soundsEnabled: true, now: NOW })).toEqual({ schedule: false });
});

test("sonidos OFF → no programar aunque haya descanso", () => {
  expect(restNotificationPlan({ restUntil: NOW + 90_000, soundsEnabled: false, now: NOW })).toEqual({ schedule: false });
});

test("descanso ya vencido (<= now) → no programar", () => {
  expect(restNotificationPlan({ restUntil: NOW - 1, soundsEnabled: true, now: NOW })).toEqual({ schedule: false });
});
