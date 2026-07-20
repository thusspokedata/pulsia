import { render, screen, fireEvent } from "@testing-library/react-native";
import { alternativesFor, hasExerciseMedia } from "@pulsia/shared";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getRestState, setRestState } from "../src/storage/restState";
import { AlternativasPicker } from "../src/components/AlternativasPicker";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));

beforeEach(() => mockPush.mockClear());

const alts = alternativesFor("barbell_bench_press", ["dumbbell", "bench"] as never);

test("abrir el detalle no toca el timing persistido de la sesión", async () => {
  // Antes este test hacía set y get sin nada en el medio: pasaba igual con el código roto,
  // y habría pasado también antes de que esta feature existiera. Ahora sí ejerce el camino
  // real (montar el picker y tocar el ojo) y espía la escritura, que es lo que importa:
  // mirar una demostración no debe reescribir el estado de la sesión en curso.
  const antes = { sessionId: "s1", setStart: 1000, restUntil: 5000, restRemaining: null };
  await setRestState(antes);
  const escrituras = jest.spyOn(AsyncStorage, "setItem");
  escrituras.mockClear(); // AsyncStorage ya es un mock: el espía hereda la escritura del setup

  await render(<AlternativasPicker alternativas={alts} elegido={null} onPick={jest.fn()} />);
  fireEvent.press(screen.getByTestId("alt-ver-dumbbell_bench_press"));

  expect(escrituras).not.toHaveBeenCalled();
  expect(await getRestState()).toEqual(antes);
  escrituras.mockRestore();
});

test("hay alternativas con ilustración para ofrecer el acceso", () => {
  // Si esto da 0, el acceso en el picker no se vería nunca y la tarea no tendría sentido.
  expect(alts.filter((a) => hasExerciseMedia(a.id)).length).toBeGreaterThan(0);
});

// EL test de la tarea: mirar el dibujo NO puede cambiarte el ejercicio de la sesión.
// Por eso los dos Pressable son HERMANOS y no uno adentro del otro.
test("tocar el ojo NO cambia el ejercicio elegido", async () => {
  const onPick = jest.fn();
  await render(<AlternativasPicker alternativas={alts} elegido={null} onPick={onPick} />);
  fireEvent.press(screen.getByTestId("alt-ver-dumbbell_bench_press"));
  expect(onPick).not.toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledWith("/ejercicio/dumbbell_bench_press");
});

test("tocar el nombre SÍ elige la alternativa", async () => {
  const onPick = jest.fn();
  await render(<AlternativasPicker alternativas={alts} elegido={null} onPick={onPick} />);
  fireEvent.press(screen.getByTestId("alt-dumbbell_bench_press"));
  expect(onPick).toHaveBeenCalledWith("dumbbell_bench_press", "Dumbbell Bench Press");
  expect(mockPush).not.toHaveBeenCalled();
});

test("la alternativa SIN ilustración no ofrece el ojo", async () => {
  await render(<AlternativasPicker alternativas={alts} elegido={null} onPick={jest.fn()} />);
  // dumbbell_floor_press existe como alternativa pero no tiene ilustración.
  expect(screen.getByTestId("alt-dumbbell_floor_press")).toBeTruthy();
  expect(screen.queryByTestId("alt-ver-dumbbell_floor_press")).toBeNull();
});

test("sin alternativas muestra el aviso en vez de una lista vacía", async () => {
  await render(<AlternativasPicker alternativas={[]} elegido={null} onPick={jest.fn()} />);
  expect(screen.getByText(/No hay alternativas con tu equipo/)).toBeTruthy();
});

test("el ojo NO es descendiente del Pressable de la fila (estructura, no handler)", async () => {
  await render(
    <AlternativasPicker alternativas={alts} elegido={null} onPick={jest.fn()} />,
  );

  // Por qué un test estructural y no de comportamiento: fireEvent.press despacha sobre el
  // elemento que se le pasa y NO simula la negociación de responder de React Native, así que
  // no puede distinguir un Pressable anidado de uno hermano. Verificado: volver a anidarlos
  // deja los tests de comportamiento en verde. Esto sí lo detecta.
  const ojo = screen.getByTestId("alt-ver-dumbbell_bench_press");
  const fila = screen.getByTestId("alt-dumbbell_bench_press");

  const ancestros: unknown[] = [];
  for (let n = ojo.parent; n; n = n.parent) ancestros.push(n);
  expect(ancestros).not.toContain(fila);
});
