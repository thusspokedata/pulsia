import AsyncStorage from "@react-native-async-storage/async-storage";
import { getStoredProgram, setStoredProgram } from "../src/storage/program";
import type { Program } from "@pulsia/shared";

const program: Program = {
  name: "Plan", weeks: [{ weekNumber: 1, workouts: [
    { dayLabel: "D1", location: "gym", targetMuscles: ["chest"], exercises: [
      { catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", sets: 3, reps: "8-10", targetLoad: "RPE 7", restSeconds: 90, notes: "" },
    ] },
  ] }],
};

beforeEach(async () => { await AsyncStorage.clear(); });

test("null si no hay programa", async () => {
  expect(await getStoredProgram()).toBeNull();
});

test("guarda y recupera un programa", async () => {
  await setStoredProgram(program);
  expect(await getStoredProgram()).toEqual(program);
});

test("migra un programa legacy (focus, sin targetMuscles) cacheado antes de GEN-1", async () => {
  const legacyProgram = {
    name: "Plan",
    weeks: [{ weekNumber: 1, workouts: [
      { dayLabel: "D1", location: "gym", focus: "chest", exercises: [
        { catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", sets: 3, reps: "8-10", targetLoad: "RPE 7", restSeconds: 90, notes: "" },
      ] },
    ] }],
  };
  await AsyncStorage.setItem("pulsia.program", JSON.stringify(legacyProgram));
  const result = await getStoredProgram();
  expect(result).not.toBeNull();
  expect(result?.weeks[0].workouts[0].targetMuscles).toEqual(["chest"]);
});
