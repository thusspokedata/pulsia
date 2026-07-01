import AsyncStorage from "@react-native-async-storage/async-storage";
import { getProfile, setProfile } from "../src/storage/profile";
import type { TrainingProfile } from "@pulsia/shared";

const profile: TrainingProfile = {
  experience: "intermediate",
  goal: "hypertrophy",
  daysPerWeek: 4,
  sessionMinutes: 60,
  gymEquipment: ["barbell", "dumbbell"],
  homeEquipment: ["bodyweight"],
  limitations: [],
};

beforeEach(async () => { await AsyncStorage.clear(); });

test("devuelve null si no hay perfil", async () => {
  expect(await getProfile()).toBeNull();
});

test("guarda y recupera un perfil válido", async () => {
  await setProfile(profile);
  expect(await getProfile()).toEqual(profile);
});

test("getProfile devuelve null si lo guardado es inválido", async () => {
  await AsyncStorage.setItem("pulsia.profile", JSON.stringify({ experience: "x" }));
  expect(await getProfile()).toBeNull();
});
