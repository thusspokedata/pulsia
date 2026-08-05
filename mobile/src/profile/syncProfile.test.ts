import { syncProfileToBackend } from "./syncProfile";
import { getProfile } from "../storage/profile";
import { getBackendProfile, putProfile } from "../api/profile";
import type { TrainingProfile } from "@pulsia/shared";

jest.mock("../storage/profile", () => ({ getProfile: jest.fn() }));
jest.mock("../api/profile", () => ({ getBackendProfile: jest.fn(), putProfile: jest.fn() }));

const URL = "http://backend.test";
const LOCAL_PROFILE: TrainingProfile = {
  experience: "beginner",
  goal: "general_fitness",
  daysPerWeek: 3,
  sessionMinutes: 45,
  gymEquipment: [],
  homeEquipment: ["bodyweight"],
  limitations: [],
};

afterEach(() => {
  jest.clearAllMocks();
});

test("local existe + backend sin perfil (404/null) → sube el perfil local", async () => {
  (getProfile as jest.Mock).mockResolvedValue(LOCAL_PROFILE);
  (getBackendProfile as jest.Mock).mockResolvedValue(null);

  await syncProfileToBackend(URL);

  expect(putProfile).toHaveBeenCalledWith(URL, LOCAL_PROFILE);
});

test("local existe + backend ya tiene perfil → NO sube nada", async () => {
  (getProfile as jest.Mock).mockResolvedValue(LOCAL_PROFILE);
  (getBackendProfile as jest.Mock).mockResolvedValue({ ...LOCAL_PROFILE, age: 30 });

  await syncProfileToBackend(URL);

  expect(putProfile).not.toHaveBeenCalled();
});

test("sin perfil local → no llama ni a getBackendProfile ni a putProfile", async () => {
  (getProfile as jest.Mock).mockResolvedValue(null);

  await syncProfileToBackend(URL);

  expect(getBackendProfile).not.toHaveBeenCalled();
  expect(putProfile).not.toHaveBeenCalled();
});

test("getBackendProfile lanza (offline/backend caído) → no propaga y no sube nada", async () => {
  (getProfile as jest.Mock).mockResolvedValue(LOCAL_PROFILE);
  (getBackendProfile as jest.Mock).mockRejectedValue(new Error("network"));

  await expect(syncProfileToBackend(URL)).resolves.toBeUndefined();
  expect(putProfile).not.toHaveBeenCalled();
});

// Carrera: el usuario guarda un perfil NUEVO mientras el read del backend está en vuelo. El
// backfill re-lee el local antes de escribir, así sube el valor nuevo y no pisa el guardado
// reciente con el snapshot viejo.
test("perfil cambia durante el read del backend → sube el valor NUEVO, no el viejo", async () => {
  const NEWER_PROFILE: TrainingProfile = { ...LOCAL_PROFILE, age: 42 };
  (getProfile as jest.Mock)
    .mockResolvedValueOnce(LOCAL_PROFILE) // snapshot inicial (antes del guardado del usuario)
    .mockResolvedValueOnce(NEWER_PROFILE); // re-lectura justo antes del PUT (ya con el guardado)
  (getBackendProfile as jest.Mock).mockResolvedValue(null);

  await syncProfileToBackend(URL);

  expect(putProfile).toHaveBeenCalledTimes(1);
  expect(putProfile).toHaveBeenCalledWith(URL, NEWER_PROFILE);
});
