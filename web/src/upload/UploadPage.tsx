import { useState } from "react";
import { importFile } from "./importFile";
import { runBatch, type BatchItem } from "./runBatch";

function describe(item: BatchItem): string {
  if (item.status === "pending") return "en cola";
  if (item.status === "running") return "subiendo…";
  if (item.status === "error") return `✗ ${item.error}`;
  const r = item.result!;
  if (r.kind === "strength") return "✓ entreno de fuerza importado";
  if (r.kind === "cardio") return r.duplicate ? "• ya estaba (duplicado)" : "✓ actividad importada";
  return `✓ ${r.imported} importados / ${r.duplicates} duplicados (${r.kind})`;
}

export function UploadPage() {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [busy, setBusy] = useState(false);

  async function onFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    await runBatch(Array.from(fileList), {
      concurrency: 3,
      importer: importFile,
      onUpdate: (next) => setItems([...next]),
    });
    setBusy(false);
  }

  return (
    <section>
      <h2>Subir archivos</h2>
      <p>Arrastrá o elegí varios <code>.fit</code> y <code>.csv</code> (peso, pasos, sueño).</p>
      <label>
        Elegir archivos
        <input type="file" multiple accept=".fit,.csv" onChange={(e) => onFiles(e.target.files)} disabled={busy} />
      </label>
      <ul>
        {items.map((it, i) => (
          <li key={i}>
            <strong>{it.file.name}</strong> — {describe(it)}
          </li>
        ))}
      </ul>
    </section>
  );
}
