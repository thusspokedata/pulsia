import { render, screen, fireEvent } from "@testing-library/react-native";
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
