import { render, screen, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ProgramaScreen from "../app/(tabs)/index";

jest.mock("expo-router", () => ({
  Link: ({ children }: any) => children,
  useFocusEffect: (cb: any) => cb(),
}));

beforeEach(async () => { await AsyncStorage.clear(); });

test("muestra el resumen cuando hay un programa guardado", async () => {
  const program = { name: "Hipertrofia 4 días", weeks: [
    { weekNumber: 1, workouts: [{ dayLabel: "D1", location: "gym", focus: "chest", exercises: [] }] },
    { weekNumber: 2, workouts: [] },
  ] };
  await AsyncStorage.setItem("pulsia.program", JSON.stringify(program));
  await render(<ProgramaScreen />);
  await waitFor(() => {
    expect(screen.getByText("Hipertrofia 4 días")).toBeTruthy();
    expect(screen.getByText("2 semanas")).toBeTruthy();
  });
});
