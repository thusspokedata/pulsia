import { render, waitFor } from "@testing-library/react-native";
import GenerandoScreen from "../app/generando";
import { startGeneration, getGenerationStatus } from "../src/api/programs";
import { setStoredProgram } from "../src/storage/program";
import { router } from "expo-router";

jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));
jest.mock("../src/storage/config", () => ({ getBackendUrl: async () => "http://b.test" }));
jest.mock("../src/storage/profile", () => ({ getProfile: async () => ({ experience: "beginner", goal: "general_fitness", daysPerWeek: 2, sessionMinutes: 45, gymEquipment: ["barbell"], homeEquipment: ["bodyweight"], limitations: [] }) }));
jest.mock("../src/storage/program", () => ({ setStoredProgram: jest.fn() }));
jest.mock("../src/storage/programId", () => ({ setStoredProgramId: jest.fn() }));
const prog = { name: "Plan", weeks: [] };
jest.mock("../src/api/programs", () => ({
  GenerationError: class extends Error { code: string; constructor(code: string, m: string){ super(m); this.code = code; } },
  startGeneration: jest.fn(async () => ({ jobId: "job-1" })),
  getGenerationStatus: jest.fn(),
}));

test("startea, pollea hasta done y guarda + navega", async () => {
  (getGenerationStatus as jest.Mock).mockResolvedValueOnce({ status: "pending" }).mockResolvedValue({ status: "done", programId: "p1", program: prog });
  render(<GenerandoScreen />);
  await waitFor(() => expect(startGeneration).toHaveBeenCalled());
  await waitFor(() => expect(setStoredProgram).toHaveBeenCalledWith(prog), { timeout: 10000 });
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
}, 20000);
