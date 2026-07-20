import { render, screen } from "@testing-library/react-native";
import { ExerciseDetail } from "../src/components/ExerciseDetail";

jest.mock("expo-router", () => ({ router: { back: jest.fn() } }));

test("muestra el nombre en español y el inglés como secundario", async () => {
  await render(<ExerciseDetail catalogId="barbell_bench_press" />);
  expect(screen.getByText("Press de banca con barra")).toBeTruthy();
  expect(screen.getByText("Barbell Bench Press")).toBeTruthy();
});

test("muestra los cues numerados", async () => {
  await render(<ExerciseDetail catalogId="barbell_bench_press" />);
  expect(screen.getByText(/Agarrá la barra/)).toBeTruthy();
});

test("un ejercicio sin ilustración no rompe y no muestra animación", async () => {
  await render(<ExerciseDetail catalogId="kettlebell_squat" />);
  expect(screen.queryByTestId("exercise-animation")).toBeNull();
  expect(screen.getByText("Sentadilla con kettlebell")).toBeTruthy();
});

test("un catalogId inexistente no rompe", async () => {
  await render(<ExerciseDetail catalogId="no-existe-xyz" />);
  expect(screen.getByText(/no encontrado/i)).toBeTruthy();
});
