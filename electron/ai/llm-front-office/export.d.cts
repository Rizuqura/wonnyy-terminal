/** Serialize validated, allowlisted metrics without exporting a chat record. */
export function exportTraces(
  values: unknown[],
  format?: "json" | "csv",
): string;
