import { render, screen, fireEvent } from "@testing-library/react-native";
import { WorkoutDayCard } from "../src/components/WorkoutDayCard";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));

beforeEach(() => mockPush.mockClear());

const workout = {
  dayLabel: "Día 1 - Empuje", location: "gym", focus: "chest",
  exercises: [
    { catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", sets: 4, reps: "8-10", targetLoad: "RPE 8", restSeconds: 120, notes: "" },
    { catalogId: "overhead_press", garminName: "Overhead Press", sets: 3, reps: "10", targetLoad: "RPE 7", restSeconds: 90, notes: "" },
  ],
};

// kettlebell_squat existe en el catálogo pero Everkinetic no cubre kettlebell.
const workoutSinMedia = {
  dayLabel: "Día 2 - Pierna", location: "gym", focus: "legs",
  exercises: [
    { catalogId: "kettlebell_squat", garminName: "Kettlebell Squat", sets: 3, reps: "10", targetLoad: "20kg", restSeconds: 90, notes: "" },
  ],
};

test("muestra el día y sus ejercicios", async () => {
  await render(<WorkoutDayCard workout={workout as any} />);
  expect(screen.getByText("Día 1 - Empuje")).toBeTruthy();
  expect(screen.getByText("Barbell Bench Press")).toBeTruthy();
  expect(screen.getByText("4 × 8-10")).toBeTruthy();
});

// El nombre en INGLÉS es deliberado: es el que sirve para buscar el ejercicio en el reloj
// Garmin. Este test lo fija para que nadie lo "arregle" pasándolo por exerciseNameEs.
test("mantiene el nombre en inglés (deliberado: sirve para buscarlo en el reloj)", async () => {
  await render(<WorkoutDayCard workout={workout as any} />);
  expect(screen.getByText("Barbell Bench Press")).toBeTruthy();
  expect(screen.queryByText("Press de banca con barra")).toBeNull();
});

test("el ejercicio CON ilustración navega al detalle", async () => {
  await render(<WorkoutDayCard workout={workout as any} />);
  fireEvent.press(screen.getByTestId("ver-barbell_bench_press"));
  expect(mockPush).toHaveBeenCalledWith("/ejercicio/barbell_bench_press");
});

test("el ejercicio SIN ilustración no ofrece el acceso", async () => {
  await render(<WorkoutDayCard workout={workoutSinMedia as any} />);
  expect(screen.getByText("Kettlebell Squat")).toBeTruthy();
  expect(screen.queryByTestId("ver-kettlebell_squat")).toBeNull();
});
