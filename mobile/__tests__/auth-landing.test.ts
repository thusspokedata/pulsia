import { authLanding, NUTRICION_ROUTE, LOGIN_ROUTE } from "../src/auth/landing";

test("mientras carga la auth no redirige a ningún lado", () => {
  expect(authLanding({ status: "loading", inAuth: false, alreadyLanded: false })).toBeNull();
  expect(authLanding({ status: "loading", inAuth: true, alreadyLanded: true })).toBeNull();
});

test("sin sesión fuera de auth → a login", () => {
  expect(authLanding({ status: "out", inAuth: false, alreadyLanded: false })).toBe(LOGIN_ROUTE);
});

test("sin sesión ya parado en login/registro → no se lo saca de ahí", () => {
  expect(authLanding({ status: "out", inAuth: true, alreadyLanded: false })).toBeNull();
});

test("arranque en frío con sesión → aterriza en Nutrición (la pestaña más usada)", () => {
  expect(authLanding({ status: "in", inAuth: false, alreadyLanded: false })).toBe(NUTRICION_ROUTE);
});

test("recién logueado (venía de login/registro) → a Nutrición", () => {
  expect(authLanding({ status: "in", inAuth: true, alreadyLanded: false })).toBe(NUTRICION_ROUTE);
  expect(authLanding({ status: "in", inAuth: true, alreadyLanded: true })).toBe(NUTRICION_ROUTE);
});

test("después del aterrizaje inicial NO vuelve a redirigir: respeta el replace('/') a Programa", () => {
  // Este es el caso clave: terminás un entreno, la sesión hace replace("/") (Programa). El guard NO
  // debe re-mandarte a Nutrición.
  expect(authLanding({ status: "in", inAuth: false, alreadyLanded: true })).toBeNull();
});
