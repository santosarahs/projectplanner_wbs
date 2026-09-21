// Types and calculations shared by the server and the browser. Keep this file free of server-only imports.

export type CellStatus = "C" | "NR" | null;

export type WbsUnit = { label: string; group: string | null };
export type WbsPhase = { id: string; title: string };
export type WbsTask = {
  id: string;
  phase: string;
  title: string;
  category: string | null;
  minutes: number | null;
  owner: string | null;
  cells: CellStatus[];
};

export type WbsData = {
  title: string;
  description: string | null;
  unit: string | null;
  units: WbsUnit[];
  phases: WbsPhase[];
  tasks: WbsTask[];
};

export type WbsRow = {
  slug: string;
  title: string;
  unit: string | null;
  masterProject: string | null;
  sourceFile: string | null;
  updatedBy: string | null;
  updatedAt: string;
  data: WbsData;
};

export const CONTINGENCY = 0.15;

export function normalizeName(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

export type TaskStats = {
  done: number;
  notRequired: number;
  applicable: number;
  progress: number | null;
};

export function taskStats(t: WbsTask): TaskStats {
  let done = 0;
  let notRequired = 0;
  for (const c of t.cells) {
    if (c === "C") done++;
    else if (c === "NR") notRequired++;
  }
  const applicable = t.cells.length - notRequired;
  return { done, notRequired, applicable, progress: applicable > 0 ? done / applicable : null };
}

export type WbsStats = {
  tasks: number;
  done: number;
  applicable: number;
  progress: number;
  plannedHours: number;
  doneHours: number;
  remainingHours: number;
  estimateHours: number;
};

// Progress is weighted by effort (minutes per unit x units), falling back to a plain
// count of cells when no task has minutes. "Not required" units are excluded.
export function statsFor(tasks: WbsTask[]): WbsStats {
  let done = 0;
  let applicable = 0;
  let plannedMinutes = 0;
  let doneMinutes = 0;
  for (const t of tasks) {
    const s = taskStats(t);
    done += s.done;
    applicable += s.applicable;
    const m = t.minutes ?? 0;
    plannedMinutes += m * s.applicable;
    doneMinutes += m * s.done;
  }
  const progress = plannedMinutes > 0 ? doneMinutes / plannedMinutes : applicable > 0 ? done / applicable : 0;
  const plannedHours = plannedMinutes / 60;
  const doneHours = doneMinutes / 60;
  return {
    tasks: tasks.length,
    done,
    applicable,
    progress,
    plannedHours,
    doneHours,
    remainingHours: plannedHours - doneHours,
    estimateHours: plannedHours * (1 + CONTINGENCY),
  };
}

export type WbsSummary = {
  slug: string;
  title: string;
  unit: string | null;
  description: string | null;
  masterProject: string | null;
  updatedAt: string;
  updatedBy: string | null;
  units: number;
  stats: WbsStats;
};

export function summarize(row: WbsRow): WbsSummary {
  return {
    slug: row.slug,
    title: row.title,
    unit: row.unit,
    description: row.data.description,
    masterProject: row.masterProject,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
    units: row.data.units.length,
    stats: statsFor(row.data.tasks),
  };
}

export function formatHours(h: number): string {
  return h >= 10 ? Math.round(h).toString() : (Math.round(h * 10) / 10).toString();
}
