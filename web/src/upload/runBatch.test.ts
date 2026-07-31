import { runBatch, type BatchItem } from "./runBatch";

test("procesa todos; un fallo no frena a los demás; reporta por archivo", async () => {
  const files = [new File(["a"], "a.fit"), new File(["b"], "b.csv"), new File(["c"], "c.fit")];
  const importer = vi.fn(async (f: File) => {
    if (f.name === "b.csv") throw new Error("boom");
    return { kind: "cardio" as const };
  });
  const updates: BatchItem[][] = [];
  const results = await runBatch(files, { concurrency: 2, importer, onUpdate: (items) => updates.push(items.map((i) => ({ ...i }))) });

  expect(results).toHaveLength(3);
  expect(results.find((r) => r.file.name === "a.fit")!.status).toBe("ok");
  expect(results.find((r) => r.file.name === "b.csv")!.status).toBe("error");
  expect(results.find((r) => r.file.name === "b.csv")!.error).toBe("boom");
  expect(results.find((r) => r.file.name === "c.fit")!.status).toBe("ok");
  expect(importer).toHaveBeenCalledTimes(3);
  expect(updates.length).toBeGreaterThan(0); // hubo notificaciones de progreso
});
