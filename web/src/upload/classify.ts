export type FileKind = "fit" | "csv" | "unknown";

export function classifyByExtension(filename: string): FileKind {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "fit") return "fit";
  if (ext === "csv") return "csv";
  return "unknown";
}
