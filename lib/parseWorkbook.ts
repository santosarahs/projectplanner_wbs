import * as XLSX from "xlsx";

export type WeekTeam = {
  name: string;
  header: string[] | null;
  rows: (string | number | null)[][];
  criticalIssues: string[];
  escalations: string[];
};

export type WeekData = {
  reportingDate: string | null;
  generatedDate: string | null;
  teams: WeekTeam[];
};

export type ParsedWorkbook = {
  sheetOrder: string[];
  sheets: Record<string, WeekData>;
};

const EXCLUDED_SHEETS = new Set(["Sheet1", "Sheet2", "Sheet3"]);
const CONTROL_LABELS = new Set(["Critical Issues or Delays", "Escalations or Support Needed"]);

export type Cell = string | number | null;

function cellValue(cell: XLSX.CellObject | undefined): Cell {
  if (!cell || cell.v === undefined || cell.v === null) return null;
  if (cell.t === "d") {
    const d = cell.v as Date;
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  if (cell.t === "n" || cell.t === "b") return cell.v as number;
  if (cell.t === "s") {
    const s = String(cell.v).trim();
    return s === "" ? null : s;
  }
  return null;
}

// Reads a sheet into a fixed-width grid (like openpyxl's iter_rows), so that
// a value's column *position* is meaningful and stable across rows -- the
// parser below relies on that to tell a section heading apart from a data row.
export function sheetToGrid(ws: XLSX.WorkSheet): Cell[][] {
  if (!ws["!ref"]) return [];
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const rows: Cell[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: Cell[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      row.push(cellValue(ws[addr] as XLSX.CellObject | undefined));
    }
    rows.push(row);
  }
  return rows;
}

export function parseWorkbook(buffer: ArrayBuffer): ParsedWorkbook {
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true });
  const sheetOrder = wb.SheetNames.filter((n) => !EXCLUDED_SHEETS.has(n));
  const sheets: Record<string, WeekData> = {};

  for (const sname of sheetOrder) {
    const ws = wb.Sheets[sname];
    const rows = sheetToGrid(ws);

    let hashCol: number | null = null;
    for (const row of rows) {
      const idx = row.findIndex((v) => typeof v === "string" && v.trim() === "#");
      if (idx !== -1) {
        hashCol = idx;
        break;
      }
    }

    let reportingDate: string | null = null;
    let generatedDate: string | null = null;
    const teams: WeekTeam[] = [];
    let currentTeam: WeekTeam | null = null;
    let mode: "critical" | "escalation" | null = null;

    for (const row of rows) {
      const nonNull: [number, Cell][] = [];
      row.forEach((v, i) => {
        if (v !== null) nonNull.push([i, v]);
      });
      if (nonNull.length === 0) continue;

      const [firstIdx, firstVal] = nonNull[0];

      if (typeof firstVal === "string" && firstVal.toLowerCase().startsWith("reporting date")) {
        reportingDate = firstVal.split(":").slice(1).join(":").trim();
        continue;
      }
      if (typeof firstVal === "string" && firstVal.toLowerCase().startsWith("generate report")) {
        generatedDate = firstVal.split(":").slice(1).join(":").trim();
        continue;
      }

      if (hashCol !== null && firstIdx === hashCol) {
        if (typeof firstVal === "string" && firstVal === "#") {
          const header = nonNull.map(([, v]) => String(v));
          if (currentTeam) currentTeam.header = header;
          mode = null;
          continue;
        }
        if (nonNull.length === 1) {
          if (typeof firstVal === "string" && CONTROL_LABELS.has(firstVal)) {
            mode = firstVal.startsWith("Critical") ? "critical" : "escalation";
            continue;
          }
          currentTeam = { name: String(firstVal), header: null, rows: [], criticalIssues: [], escalations: [] };
          teams.push(currentTeam);
          mode = null;
          continue;
        }
        if (currentTeam) currentTeam.rows.push(nonNull.map(([, v]) => v));
        continue;
      }

      if (hashCol !== null && firstIdx === hashCol + 1 && nonNull.length === 1 && mode && currentTeam) {
        const text = String(firstVal).trim();
        if (text && text.toLowerCase() !== "none") {
          currentTeam[mode === "critical" ? "criticalIssues" : "escalations"].push(text);
        }
        continue;
      }
      // Anything else is a stray/misaligned cell -- ignore rather than guess.
    }

    sheets[sname] = {
      reportingDate,
      generatedDate,
      teams: teams.filter((t) => t.header && t.header.length > 0 && !/^\d+$/.test(t.name.trim())),
    };
  }

  return { sheetOrder, sheets };
}
