import { test, expect } from "bun:test";
import { OneOffRequestSchema } from "./oneoff";

const profile = {
  experience: "intermediate", goal: "hypertrophy", daysPerWeek: 4, sessionMinutes: 60,
  gymEquipment: ["barbell", "dumbbell"], homeEquipment: ["dumbbell"], limitations: [],
};

test("acepta el payload nuevo completo", () => {
  const r = OneOffRequestSchema.safeParse({
    profile, location: "gym", focus: ["chest", "triceps"],
    sessionMinutes: 45, equipment: ["dumbbell"], notes: "me duele la cintura",
  });
  expect(r.success).toBe(true);
  if (r.success) {
    expect(r.data.focus).toEqual(["chest", "triceps"]);
    expect(r.data.sessionMinutes).toBe(45);
    expect(r.data.equipment).toEqual(["dumbbell"]);
    expect(r.data.notes).toBe("me duele la cintura");
  }
});

test("back-compat: focus single string se coacciona a array", () => {
  const r = OneOffRequestSchema.safeParse({ profile, location: "home", focus: "chest" });
  expect(r.success).toBe(true);
  if (r.success) {
    expect(r.data.focus).toEqual(["chest"]);
    expect(r.data.sessionMinutes).toBeUndefined();
    expect(r.data.equipment).toEqual([]);
  }
});

test("focus vacío falla", () => {
  const r = OneOffRequestSchema.safeParse({ profile, location: "gym", focus: [] });
  expect(r.success).toBe(false);
});

test("sessionMinutes fuera de rango falla", () => {
  const r = OneOffRequestSchema.safeParse({ profile, location: "gym", focus: ["chest"], sessionMinutes: 5 });
  expect(r.success).toBe(false);
});

test("location inválida falla", () => {
  const r = OneOffRequestSchema.safeParse({ profile, location: "beach", focus: ["chest"] });
  expect(r.success).toBe(false);
});
