import { useState } from "react";
import { importFile } from "./importFile";
import { runBatch, type BatchItem } from "./runBatch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function describe(item: BatchItem): string {
  if (item.status === "pending") return "en cola";
  if (item.status === "running") return "subiendo…";
  if (item.status === "error") return `✗ ${item.error}`;
  const r = item.result!;
  if (r.kind === "strength") return r.duplicate ? "• ya estaba (duplicado)" : "✓ entreno de fuerza importado";
  if (r.kind === "cardio") return r.duplicate ? "• ya estaba (duplicado)" : "✓ actividad importada";
  return `✓ ${r.imported} importados / ${r.duplicates} duplicados (${r.kind})`;
}

export function UploadPage() {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

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
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>Subir archivos</CardTitle>
      </CardHeader>
      <CardContent>
        <section
          data-testid="dropzone"
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            onFiles(e.dataTransfer.files);
          }}
          className={cn(
            "rounded-lg border-2 border-dashed p-8 text-center text-sm text-muted-foreground",
            dragging && "border-primary bg-secondary/40",
          )}
        >
          <p>Arrastrá o elegí varios <code>.fit</code> y <code>.csv</code> (peso, pasos, sueño).</p>
          <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm text-foreground hover:bg-secondary">
            Elegir archivos
            <input type="file" multiple accept=".fit,.csv" onChange={(e) => onFiles(e.target.files)} disabled={busy} className="sr-only" />
          </label>
        </section>
        <ul className="mt-4 flex flex-col gap-2">
          {items.map((it, i) => (
            <li key={i} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
              <span className="truncate font-medium">{it.file.name}</span>
              <span className={cn(it.status === "error" ? "text-destructive" : "text-muted-foreground")}>{describe(it)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
