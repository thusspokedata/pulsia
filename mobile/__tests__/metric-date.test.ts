import { dayAtNoon, dayLabel } from "../src/session/metricDate";
test("dayAtNoon(0) = mediodía de hoy", () => {
  const now = new Date(2026, 6, 11, 9, 30).getTime();
  const d = new Date(dayAtNoon(0, now));
  expect(d.getHours()).toBe(12); expect(d.getDate()).toBe(11);
});
test("dayAtNoon(2) = mediodía de hace 2 días", () => {
  const now = new Date(2026, 6, 11, 9, 30).getTime();
  const d = new Date(dayAtNoon(2, now));
  expect(d.getDate()).toBe(9); expect(d.getHours()).toBe(12);
});
test("dayLabel: hoy/ayer y fecha para días más lejanos", () => {
  const now = new Date(2026, 6, 11, 9, 30).getTime();
  expect(dayLabel(0, now)).toBe("hoy");
  expect(dayLabel(1, now)).toBe("ayer");
  // 3 días atrás → fecha legible. Igualdad exacta: el "8" suelto matcheaba un dígito
  // de adentro del epoch crudo, así que dayLabel podía devolver "1783504800000" y pasar.
  expect(dayLabel(3, now)).toBe("mié, 8 jul");
});
