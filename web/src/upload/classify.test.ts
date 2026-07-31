import { classifyByExtension } from "./classify";

test("detecta .fit y .FIT", () => {
  expect(classifyByExtension("actividad.fit")).toBe("fit");
  expect(classifyByExtension("ACT.FIT")).toBe("fit");
});
test("detecta .csv", () => {
  expect(classifyByExtension("peso.csv")).toBe("csv");
});
test("desconocido para otras extensiones", () => {
  expect(classifyByExtension("foto.png")).toBe("unknown");
  expect(classifyByExtension("sinextension")).toBe("unknown");
});
