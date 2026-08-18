import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { NotesEditor } from "../src/components/NotesEditor";

test("muestra el valor y emite onChangeText al escribir", async () => {
  const onChangeText = jest.fn();
  await render(<NotesEditor value="hola" onChangeText={onChangeText} />);
  const input = screen.getByTestId("notes-input");
  expect(input.props.value).toBe("hola");
  await fireEvent.changeText(input, "hola mundo");
  expect(onChangeText).toHaveBeenCalledWith("hola mundo");
});

test("respeta editable=false", async () => {
  await render(<NotesEditor value="x" onChangeText={() => {}} editable={false} />);
  expect(screen.getByTestId("notes-input").props.editable).toBe(false);
});

test("sin onSave NO renderiza el botón de guardar (usos viejos intactos)", async () => {
  await render(<NotesEditor value="x" onChangeText={() => {}} />);
  expect(screen.queryByTestId("notes-save")).toBeNull();
});

test("con onSave: aparece el botón, al tocarlo llama onSave y muestra 'Guardado ✓'", async () => {
  const onSave = jest.fn(async () => {});
  await render(<NotesEditor value="x" onChangeText={() => {}} onSave={onSave} />);
  const btn = screen.getByTestId("notes-save");
  expect(btn).toBeTruthy();
  // Antes de guardar no hay confirmación.
  expect(screen.queryByTestId("notes-saved")).toBeNull();

  await fireEvent.press(btn);
  expect(onSave).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.getByTestId("notes-saved")).toBeTruthy());
});

test("si onSave rechaza NO muestra 'Guardado ✓'", async () => {
  const onSave = jest.fn(async () => {
    throw new Error("boom");
  });
  await render(<NotesEditor value="x" onChangeText={() => {}} onSave={onSave} />);
  await fireEvent.press(screen.getByTestId("notes-save"));
  expect(onSave).toHaveBeenCalledTimes(1);
  // Le damos margen: aunque resolviera async, nunca debe aparecer la confirmación.
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  expect(screen.queryByTestId("notes-saved")).toBeNull();
});
