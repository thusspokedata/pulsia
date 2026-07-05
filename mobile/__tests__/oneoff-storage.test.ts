import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getStoredOneOffProgram,
  setStoredOneOffProgram,
  getStoredOneOffProgramId,
  setStoredOneOffProgramId,
  clearOneOff,
} from "../src/storage/oneOffProgram";
import type { Program } from "@pulsia/shared";

const program: Program = {
  name: "Entreno puntual", weeks: [{ weekNumber: 1, workouts: [
    { dayLabel: "D1", location: "gym", focus: "chest", exercises: [
      { catalogId: "barbell_bench_press", garminName: "Barbell Bench Press", sets: 3, reps: "8-10", targetLoad: "RPE 7", restSeconds: 90, notes: "" },
    ] },
  ] }],
};

beforeEach(async () => { await AsyncStorage.clear(); });

test("null si no hay one-off guardado", async () => {
  expect(await getStoredOneOffProgram()).toBeNull();
});

test("guarda y recupera un one-off program", async () => {
  await setStoredOneOffProgram(program);
  expect(await getStoredOneOffProgram()).toEqual(program);
});

test("oneOffProgramId: set/get", async () => {
  expect(await getStoredOneOffProgramId()).toBeNull();
  await setStoredOneOffProgramId("33333333-3333-4333-8333-333333333333");
  expect(await getStoredOneOffProgramId()).toBe("33333333-3333-4333-8333-333333333333");
});

test("clearOneOff elimina programa e id", async () => {
  await setStoredOneOffProgram(program);
  await setStoredOneOffProgramId("33333333-3333-4333-8333-333333333333");

  await clearOneOff();

  expect(await getStoredOneOffProgram()).toBeNull();
  expect(await getStoredOneOffProgramId()).toBeNull();
});
