import { ensureSchema, getSql } from "./db";
import type { CellStatus, WbsData, WbsRow } from "./wbs";

let wbsSchemaReady: Promise<void> | null = null;

function ensureWbsSchema(): Promise<void> {
  if (!wbsSchemaReady) {
    const sql = getSql();
    wbsSchemaReady = sql`
      CREATE TABLE IF NOT EXISTS wbs_projects (
        id SERIAL PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        unit TEXT,
        master_project TEXT,
        source_file TEXT,
        data JSONB NOT NULL,
        updated_by TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.then(
      () => undefined,
      (err) => {
        wbsSchemaReady = null;
        throw err;
      }
    );
  }
  return wbsSchemaReady;
}

type DbRow = Record<string, any>;

function toRow(r: DbRow): WbsRow {
  return {
    slug: r.slug,
    title: r.title,
    unit: r.unit,
    masterProject: r.master_project,
    sourceFile: r.source_file,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
    data: r.data as WbsData,
  };
}

export async function listWbs(): Promise<WbsRow[]> {
  await ensureWbsSchema();
  const rows = (await getSql()`
    SELECT slug, title, unit, master_project, source_file, data, updated_by, updated_at
    FROM wbs_projects
    ORDER BY title ASC
  `) as DbRow[];
  return rows.map(toRow);
}

export async function getWbs(slug: string): Promise<WbsRow | null> {
  await ensureWbsSchema();
  const rows = (await getSql()`
    SELECT slug, title, unit, master_project, source_file, data, updated_by, updated_at
    FROM wbs_projects
    WHERE slug = ${slug}
  `) as DbRow[];
  return rows[0] ? toRow(rows[0]) : null;
}

// Re-uploading a sheet with the same title replaces its tasks and statuses but keeps the
// link to the Project Master row.
export async function upsertWbs(input: {
  slug: string;
  data: WbsData;
  sourceFile: string;
  updatedBy: string | null;
}): Promise<{ replaced: boolean }> {
  await ensureWbsSchema();
  const { slug, data, sourceFile, updatedBy } = input;
  const rows = (await getSql()`
    INSERT INTO wbs_projects (slug, title, unit, source_file, data, updated_by)
    VALUES (${slug}, ${data.title}, ${data.unit}, ${sourceFile}, ${JSON.stringify(data)}::jsonb, ${updatedBy})
    ON CONFLICT (slug) DO UPDATE SET
      title = EXCLUDED.title,
      unit = EXCLUDED.unit,
      source_file = EXCLUDED.source_file,
      data = EXCLUDED.data,
      updated_by = EXCLUDED.updated_by,
      updated_at = now()
    RETURNING (xmax = 0) AS inserted
  `) as DbRow[];
  return { replaced: !rows[0]?.inserted };
}

export async function setMasterProject(slug: string, masterProject: string | null): Promise<boolean> {
  await ensureWbsSchema();
  const rows = (await getSql()`
    UPDATE wbs_projects SET master_project = ${masterProject}
    WHERE slug = ${slug}
    RETURNING slug
  `) as DbRow[];
  return rows.length > 0;
}

// Changes one unit's status in place. The WHERE clause makes sure the task at that index is
// still the one the browser saw, so a re-upload in between can't write to the wrong row.
export async function setCellStatus(input: {
  slug: string;
  taskIndex: number;
  taskId: string;
  unitIndex: number;
  status: CellStatus;
  updatedBy: string | null;
}): Promise<boolean> {
  await ensureWbsSchema();
  const { slug, taskIndex, taskId, unitIndex, status, updatedBy } = input;
  const rows = (await getSql()`
    UPDATE wbs_projects
    SET data = jsonb_set(
          data,
          ARRAY['tasks', ${String(taskIndex)}::text, 'cells', ${String(unitIndex)}::text],
          ${JSON.stringify(status)}::jsonb
        ),
        updated_by = ${updatedBy},
        updated_at = now()
    WHERE slug = ${slug}
      AND data #>> ARRAY['tasks', ${String(taskIndex)}::text, 'id'] = ${taskId}
      AND jsonb_array_length(data #> ARRAY['tasks', ${String(taskIndex)}::text, 'cells']) > ${unitIndex}
    RETURNING slug
  `) as DbRow[];
  return rows.length > 0;
}

export async function deleteWbs(slug: string): Promise<boolean> {
  await ensureWbsSchema();
  const rows = (await getSql()`DELETE FROM wbs_projects WHERE slug = ${slug} RETURNING slug`) as DbRow[];
  return rows.length > 0;
}

// Project names from the newest weekly report, used to link a WBS to its Project Master row.
export async function latestMasterProjectNames(): Promise<string[]> {
  await ensureSchema();
  const rows = (await getSql()`
    SELECT data FROM weekly_reports ORDER BY sort_order DESC LIMIT 1
  `) as DbRow[];
  const teams: { header: string[] | null; rows: (string | number | null)[][] }[] = rows[0]?.data ?? [];
  const names = new Set<string>();
  for (const team of teams) {
    if (!team.header) continue;
    const found = team.header.findIndex((h, i) => i >= 1 && /project|app\b/i.test(h));
    const projIdx = found >= 0 ? found : 1;
    for (const r of team.rows) {
      const name = r[projIdx];
      if (typeof name === "string" && name.trim()) names.add(name.replace(/\s+/g, " ").trim());
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
