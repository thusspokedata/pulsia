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
