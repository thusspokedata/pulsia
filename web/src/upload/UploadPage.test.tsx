import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UploadPage } from "./UploadPage";
import * as importer from "./importFile";

test("al elegir archivos, los sube y muestra el resultado por archivo", async () => {
  vi.spyOn(importer, "importFile").mockImplementation(async (f: File) =>
    f.name.endsWith(".fit") ? { kind: "cardio", duplicate: false } : { kind: "weight", imported: 2, duplicates: 0 },
  );
  render(<UploadPage />);
  const input = screen.getByLabelText(/elegir archivos/i) as HTMLInputElement;
  await userEvent.upload(input, [new File(["a"], "a.fit"), new File(["b"], "peso.csv")]);

  await waitFor(() => {
    expect(screen.getByText("a.fit")).toBeInTheDocument();
    expect(screen.getByText("peso.csv")).toBeInTheDocument();
  });
  await waitFor(() => expect(screen.getAllByText(/importado|cardio/i).length).toBeGreaterThan(0));
});
