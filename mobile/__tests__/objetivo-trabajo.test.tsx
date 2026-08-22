import { render, waitFor, fireEvent } from "@testing-library/react-native";
import ObjetivoTrabajoScreen from "../app/objetivo-trabajo";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../src/storage/config", () => ({ getBackendUrl: async () => "http://x" }));
const mockGet = jest.fn(async () => "mi norte");
const mockPut = jest.fn(async (_u: string, c: string) => c);
const mockDraft = jest.fn(async () => "borrador IA");
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
