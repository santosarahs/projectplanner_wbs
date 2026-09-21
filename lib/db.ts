import { sql } from "@vercel/postgres";
import type { ParsedWorkbook, WeekTeam } from "./parseWorkbook";

let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
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
      );
    `.then(() => undefined);
  }
  return schemaReady;
}

export async function replaceAllWeeks(parsed: ParsedWorkbook, uploadedBy: string | null): Promise<void> {
  await ensureSchema();
  await sql`TRUNCATE weekly_reports RESTART IDENTITY`;

  for (let i = 0; i < parsed.sheetOrder.length; i++) {
    const name = parsed.sheetOrder[i];
    const week = parsed.sheets[name];
    await sql`
      INSERT INTO weekly_reports (sheet_name, sort_order, reporting_date, generated_date, data, uploaded_by)
      VALUES (${name}, ${i}, ${week.reportingDate}, ${week.generatedDate}, ${JSON.stringify(week.teams)}::jsonb, ${uploadedBy})
    `;
  }
}

export type StoredWorkbook = {
  sheetOrder: string[];
  sheets: Record<string, { reportingDate: string | null; generatedDate: string | null; teams: WeekTeam[] }>;
  lastUploadedAt: string | null;
  lastUploadedBy: string | null;
};

export async function getAllWeeks(): Promise<StoredWorkbook> {
  await ensureSchema();
  const { rows } = await sql`
    SELECT sheet_name, reporting_date, generated_date, data, uploaded_by, uploaded_at
    FROM weekly_reports
    ORDER BY sort_order ASC
  `;

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
    lastUploadedAt = r.uploaded_at;
    lastUploadedBy = r.uploaded_by;
  }

  return { sheetOrder, sheets, lastUploadedAt, lastUploadedBy };
}
