import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ProgramaScreen from "../app/(tabs)/index";

jest.mock("expo-router", () => ({ Link: ({ children }: any) => children, useFocusEffect: (cb: any) => cb() }));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn() }));

const program = {
  name: "Plan Hipertrofia",
  weeks: [
    { weekNumber: 1, workouts: [
      { dayLabel: "Día 1 (Gym)", location: "gym", focus: "chest", exercises: [{ catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", sets: 4, reps: "8-10", targetLoad: "RPE 8", restSeconds: 120, notes: "" }] },
      { dayLabel: "Día 1 (Casa)", location: "home", focus: "chest", exercises: [{ catalogId: "push_up", garminName: "Push-Up", sets: 4, reps: "12", targetLoad: "peso corporal", restSeconds: 90, notes: "" }] },
    ] },
    { weekNumber: 2, workouts: [] },
  ],
};

beforeEach(async () => { await AsyncStorage.clear(); });

test("muestra los días de gimnasio y permite cambiar a casa", async () => {
  await AsyncStorage.setItem("pulsia.program", JSON.stringify(program));
  await render(<ProgramaScreen />);
  await waitFor(() => expect(screen.getByText("Plan Hipertrofia")).toBeTruthy());
  expect(screen.getByText("Barbell Bench Press")).toBeTruthy();
  await fireEvent.press(screen.getByText("Casa"));
  expect(screen.getByText("Push-Up")).toBeTruthy();
});
