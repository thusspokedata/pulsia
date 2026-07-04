import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import MemoriaScreen from "../app/memoria";
import { getMemory, refreshMemory } from "../src/api/memory";

jest.mock("../src/storage/config", () => ({ getBackendUrl: async () => "http://b.test" }));
jest.mock("../src/api/memory", () => ({ getMemory: jest.fn(), refreshMemory: jest.fn() }));

test("muestra la memoria cargada", async () => {
  (getMemory as jest.Mock).mockResolvedValue("no tiene barra");
  await render(<MemoriaScreen />);
  await waitFor(() => expect(screen.getByTestId("memoria-content").props.children).toContain("no tiene barra"));
});

test("Actualizar dispara refresh y muestra la memoria nueva", async () => {
  (getMemory as jest.Mock).mockResolvedValue("vieja");
  (refreshMemory as jest.Mock).mockResolvedValue("nueva");
  await render(<MemoriaScreen />);
  await waitFor(() => screen.getByTestId("memoria-actualizar"));
  await fireEvent.press(screen.getByTestId("memoria-actualizar"));
  await waitFor(() => expect(screen.getByTestId("memoria-content").props.children).toContain("nueva"));
});
