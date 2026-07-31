import type { ImportResult } from "./importFile";

export interface BatchItem {
  file: File;
  status: "pending" | "running" | "ok" | "error";
  result?: ImportResult;
  error?: string;
}

interface Opts {
  concurrency?: number;
  importer: (file: File) => Promise<ImportResult>;
  onUpdate?: (items: BatchItem[]) => void;
}

// Corre los imports con un tope de concurrencia (para no saturar la Pi). Cada archivo es
// independiente: si uno falla, se marca error y el lote sigue. Notifica el estado en cada cambio.
export async function runBatch(files: File[], opts: Opts): Promise<BatchItem[]> {
  const concurrency = Math.max(1, opts.concurrency ?? 3);
  const items: BatchItem[] = files.map((file) => ({ file, status: "pending" }));
  const notify = () => opts.onUpdate?.(items);

  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      const item = items[i];
      item.status = "running"; notify();
      try {
        item.result = await opts.importer(item.file);
        item.status = "ok";
      } catch (e) {
        item.status = "error";
        item.error = e instanceof Error ? e.message : String(e);
      }
      notify();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return items;
}
