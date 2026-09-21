import { neon } from "@neondatabase/serverless";
import type { ParsedWorkbook, WeekTeam } from "./parseWorkbook";

type Sql = ReturnType<typeof neon>;

let cachedSql: Sql | null = null;

// The Vercel/Neon integration can prefix its variables (e.g. STORAGE_URL), so
// look for a Postgres URL under the usual names first, then under any name.
function connectionString(): string {
  for (const name of ["DATABASE_URL", "POSTGRES_URL"]) {
    const value = process.env[name];
    if (value) return value;
  }

  const candidates = Object.entries(process.env)
    .filter(([, v]) => typeof v === "string" && /^postgres(ql)?:\/\//.test(v))
    .sort(([a], [b]) => Number(/UNPOOLED|NON_POOLING/.test(a)) - Number(/UNPOOLED|NON_POOLING/.test(b)));

  if (candidates.length > 0) return candidates[0][1] as string;

  throw new Error(
    "No Postgres connection string found. Connect a Neon database to this Vercel project (Storage tab), then redeploy."
  );
}

export function getSql(): Sql {
  if (!cachedSql) cachedSql = neon(connectionString());
  return cachedSql;
}

let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    const sql = getSql();
    schemaReady = sql`
      CREATE TABLE IF NOT EXISTS weekly_reports (
        id SERIAL PRIMARY KEY,
        sheet_name TEXT UNIQUE NOT NULL,
        sort_order INTEGER NOT NULL,
        reporting_date TEXT,
        generated_date TEXT,
        data JSONB NOT NULL,
        uploaded_by TEXT,
        uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.then(
      () => undefined,
      (err) => {
        schemaReady = null;
        throw err;
      }
    );
  }
  return schemaReady;
}

export async function replaceAllWeeks(parsed: ParsedWorkbook, uploadedBy: string | null): Promise<void> {
  await ensureSchema();
  const sql = getSql();

  // One transaction, so a failed upload can't leave the table half-replaced.
  await sql.transaction([
    sql`TRUNCATE weekly_reports RESTART IDENTITY`,
    ...parsed.sheetOrder.map((name, i) => {
      const week = parsed.sheets[name];
      return sql`
        INSERT INTO weekly_reports (sheet_name, sort_order, reporting_date, generated_date, data, uploaded_by)
        VALUES (${name}, ${i}, ${week.reportingDate}, ${week.generatedDate}, ${JSON.stringify(week.teams)}::jsonb, ${uploadedBy})
      `;
    }),
  ]);
}

export type StoredWorkbook = {
  sheetOrder: string[];
  sheets: Record<string, { reportingDate: string | null; generatedDate: string | null; teams: WeekTeam[] }>;
  lastUploadedAt: string | null;
  lastUploadedBy: string | null;
};

export async function getAllWeeks(): Promise<StoredWorkbook> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT sheet_name, reporting_date, generated_date, data, uploaded_by, uploaded_at
    FROM weekly_reports
    ORDER BY sort_order ASC
  `) as Record<string, any>[];

  const sheetOrder: string[] = [];
  const sheets: StoredWorkbook["sheets"] = {};
  let lastUploadedAt: string | null = null;
  let lastUploadedBy: string | null = null;

  for (const r of rows) {
    sheetOrder.push(r.sheet_name);
    sheets[r.sheet_name] = {
      reportingDate: r.reporting_date,
      generatedDate: r.generated_date,
      teams: r.data,
    };
    lastUploadedAt = r.uploaded_at instanceof Date ? r.uploaded_at.toISOString() : r.uploaded_at;
    lastUploadedBy = r.uploaded_by;
  }

  return { sheetOrder, sheets, lastUploadedAt, lastUploadedBy };
}
