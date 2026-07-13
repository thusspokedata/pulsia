import { weightToRecordOnSave } from "../src/profile/weightMeasurement";

test("registra el peso cuando cambió respecto del cargado", () => {
  expect(weightToRecordOnSave("73.8", "75")).toBe(75);
});
test("no registra si el peso no cambió", () => {
  expect(weightToRecordOnSave("73.8", "73.8")).toBeNull();
  expect(weightToRecordOnSave("73.8", " 73.8 ")).toBeNull(); // ignora espacios
});
test("no registra si el campo quedó vacío", () => {
  expect(weightToRecordOnSave("73.8", "")).toBeNull();
  expect(weightToRecordOnSave("", "")).toBeNull();
});
test("no registra valores fuera de rango (20–400) ni no numéricos", () => {
  expect(weightToRecordOnSave("73.8", "5")).toBeNull();
  expect(weightToRecordOnSave("73.8", "999")).toBeNull();
  expect(weightToRecordOnSave("73.8", "abc")).toBeNull();
});
test("registra desde vacío si se ingresa un peso válido", () => {
  expect(weightToRecordOnSave("", "70")).toBe(70);
});
