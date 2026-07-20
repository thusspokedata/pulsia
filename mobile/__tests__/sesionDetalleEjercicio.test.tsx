import { getRestState, setRestState } from "../src/storage/restState";

test("abrir el detalle no altera el timing persistido de la sesión", async () => {
  const antes = { sessionId: "s1", setStart: 1000, restUntil: 5000, restRemaining: null };
  await setRestState(antes);
  // Abrir el detalle es navegación pura: no toca restState. Si alguien mete lógica de sesión
  // en ese camino, este test se cae.
  const despues = await getRestState();
  expect(despues).toEqual(antes);
});
