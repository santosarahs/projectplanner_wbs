import * as XLSX from "xlsx";
import { sheetToGrid, type Cell } from "./parseWorkbook";
import type { CellStatus, WbsData, WbsPhase, WbsTask, WbsUnit } from "./wbs";

export type ParsedWbs = { slug: string; data: WbsData; ignoredCodes: number };

const lc = (v: Cell | undefined) => (v === null || v === undefined ? "" : String(v).trim().toLowerCase());
const text = (v: Cell | undefined): string | null => (v === null || v === undefined ? null : String(v).trim() || null);
const num = (v: Cell | undefined): number | null => {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
};

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "wbs";
}

// Reads a WBS sheet laid out like the team's template: a title block, two header rows
// (group labels + unit numbers), phase rows (1, 2, 3...) and task rows (1.1, 1.2...) with
// one status code per unit (C, NR or blank).
export function parseWbs(buffer: ArrayBuffer, fileName: string): ParsedWbs {
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true });
  const sheetName = wb.SheetNames.find((n) => n.trim().toLowerCase() === "wbs") ?? wb.SheetNames[0];
  const grid = sheetToGrid(wb.Sheets[sheetName]);

  const titleRow = grid.findIndex((row) => row.some((v) => lc(v) === "task title"));
  if (titleRow === -1) {
    throw new Error('Could not find a "Task Title" header row. Is this a WBS sheet like the template?');
  }
  const h1 = grid[titleRow];
  const h2 = grid[titleRow + 1] ?? [];
  const findCol = (row: Cell[], re: RegExp) => row.findIndex((v) => re.test(lc(v)));

  const titleCol = findCol(h1, /^task title$/);
  const idCol = Math.max(findCol(h2, /^id$/), 0);
  const categoryCol = (() => {
    const i = h1.findIndex((v, c) => lc(v) === "category" && lc(h2[c]) === "");
    return i >= 0 ? i : findCol(h1, /^category$/);
  })();
  const minutesCol = findCol(h2, /^minutes$/);
  const ownerCol = findCol(h2, /^owner$/);
  const pctCol = findCol(h2, /^%$/);
  const qtyCol = findCol(h2, /^qty$/);
  const budgetCol = findCol(h2, /^(bdgt|budget)$/);

  const firstUnitCol = Math.max(pctCol, ownerCol, minutesCol, categoryCol, titleCol) + 1;
  const endCandidates = [qtyCol, budgetCol].filter((c) => c >= firstUnitCol);
  const lastUnitCol = (endCandidates.length ? Math.min(...endCandidates) : h2.length) - 1;

  const units: WbsUnit[] = [];
  const unitCols: number[] = [];
  let group: string | null = null;
  for (let c = firstUnitCol; c <= lastUnitCol; c++) {
    if (text(h1[c])) group = text(h1[c]);
    if (h2[c] === null || h2[c] === undefined) continue;
    units.push({ label: String(h2[c]).trim(), group });
    unitCols.push(c);
  }
  if (unitCols.length === 0) {
    throw new Error("No unit columns (rooms, floors, sites...) were found next to the task columns.");
  }

  let title: string | null = null;
  let description: string | null = null;
  let unit: string | null = null;
  for (let r = 0; r < titleRow; r++) {
    const row = grid[r];
    const at = row.findIndex((v) => v !== null);
    if (at < 0) continue;
    const label = lc(row[at]);
    const valueAt = row.findIndex((v, i) => i > at && v !== null);
    const value = valueAt >= 0 ? text(row[valueAt]) : null;
    if (label.includes("title")) title = value;
    else if (label.includes("description")) description = value;
    else if (label.startsWith("unit") || label.includes("team")) unit = value;
  }
  const baseName = fileName.replace(/\.xlsx$/i, "");
  title = title ?? baseName;

  const phases: WbsPhase[] = [];
  const tasks: WbsTask[] = [];
  let ignoredCodes = 0;
  const usedIds = new Set<string>();
  const maxSub = new Map<string, number>();

  for (let r = titleRow + 2; r < grid.length; r++) {
    const row = grid[r];
    const taskTitle = text(row[titleCol]);
    if (!taskTitle) continue;

    const category = categoryCol >= 0 ? text(row[categoryCol]) : null;
    const minutes = minutesCol >= 0 ? num(row[minutesCol]) : null;
    const owner = ownerCol >= 0 ? text(row[ownerCol]) : null;
    const rawCells = unitCols.map((c) => row[c]);
    const hasCells = rawCells.some((v) => v !== null && v !== undefined);

    const idValue = row[idCol];
    const idIsWhole = idValue === null || idValue === undefined || Number.isInteger(Number(idValue));
    const isPhase = !category && minutes === null && !owner && !hasCells && idIsWhole;

    if (isPhase) {
      phases.push({ id: String(phases.length + 1), title: taskTitle });
      continue;
    }

    if (phases.length === 0) {
      phases.push({ id: "1", title: "General" });
    }
    const phase = phases[phases.length - 1];

    // Keep the sheet's own task numbers; only fall back to the next free number in the
    // phase when an ID is missing or repeated (Excel turns "3.10" into 3.1).
    let taskId = idValue === null || idValue === undefined ? "" : String(idValue).trim();
    if (!/^\d+\.\d+$/.test(taskId) || usedIds.has(taskId)) {
      taskId = `${phase.id}.${(maxSub.get(phase.id) ?? 0) + 1}`;
    }
    usedIds.add(taskId);
    const sub = Number(taskId.split(".")[1]);
    maxSub.set(phase.id, Math.max(maxSub.get(phase.id) ?? 0, sub));

    const cells: CellStatus[] = rawCells.map((v) => {
      const code = lc(v).toUpperCase();
      if (code === "") return null;
      if (code === "C" || code === "NR") return code;
      ignoredCodes++;
      return null;
    });

    tasks.push({
      id: taskId,
      phase: phase.id,
      title: taskTitle,
      category,
      minutes,
      owner,
      cells,
    });
  }

  if (tasks.length === 0) {
    throw new Error("No tasks were found below the header rows.");
  }

  return {
    slug: slugify(title),
    data: { title, description, unit, units, phases, tasks },
    ignoredCodes,
  };
}
