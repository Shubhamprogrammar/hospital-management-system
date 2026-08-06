/** Shared helpers for rendering / exporting a report job's persisted `result`. */

export function humanizeKey(key: string): string {
  return key
    .replace(/^_/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Flatten a nested aggregate row (`_count: { _all: 3 }`) one level deep for table display. */
export function flattenAggregateRow(row: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const inner = value as Record<string, unknown>;
      const keys = Object.keys(inner);
      if (keys.length === 1) flat[key.replace(/^_/, "")] = Object.values(inner)[0];
      else for (const [k, v] of Object.entries(inner)) flat[`${key}.${k}`] = v;
    } else {
      flat[key] = value;
    }
  }
  return flat;
}

export interface ReportTableSection {
  title: string;
  columns: Array<{ header: string; dataKey: string }>;
  rows: Array<Record<string, unknown>>;
}

export interface ReportSections {
  summary: Array<{ label: string; value: unknown }>;
  tables: ReportTableSection[];
}

/**
 * Split a report job's result into scalar summary metrics and array-valued
 * detail tables — stays generic across all report templates.
 */
export function buildReportSections(result: unknown): ReportSections {
  if (!result) return { summary: [], tables: [] };
  if (typeof result !== "object" || Array.isArray(result)) {
    return { summary: [{ label: "Value", value: result }], tables: [] };
  }

  const entries = Object.entries(result as Record<string, unknown>);
  const summary = entries
    .filter(([, v]) => !Array.isArray(v))
    .map(([label, value]) => ({ label: humanizeKey(label), value }));

  const tables = entries
    .filter(([, v]) => Array.isArray(v) && (v as unknown[]).length > 0)
    .map(([title, arr]) => {
      const rows = (arr as unknown[]).map((r) =>
        r && typeof r === "object" ? flattenAggregateRow(r as Record<string, unknown>) : { value: r },
      );
      const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
      return {
        title: humanizeKey(title),
        columns: keys.map((k) => ({ header: humanizeKey(k), dataKey: k })),
        rows,
      };
    });

  return { summary, tables };
}
