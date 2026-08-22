import { render, waitFor, fireEvent } from "@testing-library/react-native";
import ObjetivoTrabajoScreen from "../app/objetivo-trabajo";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../src/storage/config", () => ({ getBackendUrl: async () => "http://x" }));
const mockGet = jest.fn((..._a: any[]): Promise<string> => Promise.resolve("mi norte"));
const mockPut = jest.fn((...a: any[]): Promise<string> => Promise.resolve(a[1]));
const mockDraft = jest.fn((..._a: any[]): Promise<string> => Promise.resolve("borrador IA"));
jest.mock("../src/api/objective", () => ({
  getObjective: (...a: any[]) => mockGet(...a),
  putObjective: (...a: any[]) => mockPut(...a),
  draftObjective: (...a: any[]) => mockDraft(...a),
}));

test("carga el objetivo y permite sugerir con IA", async () => {
  const { getByTestId, getByText } = await render(<ObjetivoTrabajoScreen />);
  await waitFor(() => expect(getByTestId("objetivo-input").props.value).toBe("mi norte"));
  fireEvent.press(getByText(/Sugerir con IA/i));
  await waitFor(() => expect(getByTestId("objetivo-input").props.value).toBe("borrador IA"));
});
