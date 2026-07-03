import { render, screen } from "@testing-library/react-native";
import { WorkoutDayCard } from "../src/components/WorkoutDayCard";

const workout = {
  dayLabel: "Día 1 - Empuje", location: "gym", focus: "chest",
  exercises: [
    { catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", sets: 4, reps: "8-10", targetLoad: "RPE 8", restSeconds: 120, notes: "" },
    { catalogId: "overhead_press", garminName: "Overhead Press", sets: 3, reps: "10", targetLoad: "RPE 7", restSeconds: 90, notes: "" },
  ],
};

test("muestra el día y sus ejercicios", async () => {
  await render(<WorkoutDayCard workout={workout as any} />);
  expect(screen.getByText("Día 1 - Empuje")).toBeTruthy();
  expect(screen.getByText("Barbell Bench Press")).toBeTruthy();
  expect(screen.getByText("4 × 8-10")).toBeTruthy();
});
