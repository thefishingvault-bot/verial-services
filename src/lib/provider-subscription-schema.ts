import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

type SchemaCheckResult =
  | { ok: true; missingColumns: [] }
  | { ok: false; missingColumns: string[] };

function rowsFromExecuteResult(result: unknown): Array<Record<string, unknown>> {
  if (!result) return [];
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  if (typeof result === "object" && result && "rows" in result) {
    const rows = (result as any).rows;
    if (Array.isArray(rows)) return rows as Array<Record<string, unknown>>;
  }
  return [];
}

export async function checkProvidersColumnsExist(requiredColumns: string[]): Promise<SchemaCheckResult> {
  if (requiredColumns.length === 0) return { ok: true, missingColumns: [] };

  const inList = sql.join(
    requiredColumns.map((c) => sql`${c}`),
    sql`,`,
  );

  const result = await db.execute(sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'providers'
      and column_name in (${inList})
  `);

  const rows = rowsFromExecuteResult(result);
  const found = new Set(rows.map((r) => String(r.column_name)));
  const missing = requiredColumns.filter((c) => !found.has(c));

  return missing.length ? { ok: false, missingColumns: missing } : { ok: true, missingColumns: [] };
}
