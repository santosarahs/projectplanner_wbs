"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import {
  formatHours,
  normalizeName,
  statsFor,
  taskStats,
  CONTINGENCY,
  type CellStatus,
  type WbsRow,
} from "@/lib/wbs";

const STATUS_LABEL: Record<string, string> = { C: "Complete", NR: "Not required", pending: "Pending" };

function nextStatus(cur: CellStatus): CellStatus {
  return cur === null ? "C" : cur === "C" ? "NR" : null;
}

function pct(p: number | null) {
  return p === null ? "n/a" : `${Math.round(p * 100)}%`;
}

export default function WbsDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [row, setRow] = useState<WbsRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [masterNames, setMasterNames] = useState<string[]>([]);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch(`/api/wbs/${slug}`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? `Server responded ${res.status}`);
        setRow(body);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Could not load this WBS"));

    fetch("/api/master-projects")
      .then((r) => (r.ok ? r.json() : []))
      .then((names) => setMasterNames(Array.isArray(names) ? names : []))
      .catch(() => setMasterNames([]));
  }, [slug]);

  async function patch(body: unknown): Promise<string | null> {
    try {
      const res = await fetch(`/api/wbs/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) return null;
      const json = await res.json().catch(() => null);
      return json?.error ?? `Save failed (${res.status})`;
    } catch {
      return "Could not reach the server. Check your connection and try again.";
    }
  }

  function applyCell(taskIndex: number, unitIndex: number, status: CellStatus) {
    setRow((prev) =>
      prev && {
        ...prev,
        data: {
          ...prev.data,
          tasks: prev.data.tasks.map((t, i) =>
            i === taskIndex ? { ...t, cells: t.cells.map((c, j) => (j === unitIndex ? status : c)) } : t
          ),
        },
      }
    );
  }

  async function cycleCell(taskIndex: number, unitIndex: number) {
    if (!row) return;
    const task = row.data.tasks[taskIndex];
    const previous = task.cells[unitIndex];
    const next = nextStatus(previous);
    applyCell(taskIndex, unitIndex, next);
    setMessage(null);
    const error = await patch({ taskIndex, taskId: task.id, unitIndex, status: next });
    if (error) {
      applyCell(taskIndex, unitIndex, previous);
      setMessage({ kind: "error", text: error });
    }
  }

  async function changeLink(value: string) {
    const previous = row?.masterProject ?? null;
    setRow((prev) => prev && { ...prev, masterProject: value || null });
    const error = await patch({ masterProject: value || null });
    if (error) {
      setRow((prev) => prev && { ...prev, masterProject: previous });
      setMessage({ kind: "error", text: error });
    } else {
      setMessage({ kind: "ok", text: value ? "Linked to Project Master." : "Link removed." });
    }
  }

  async function onDelete() {
    if (!row) return;
    if (!window.confirm(`Delete the WBS "${row.title}"? This can't be undone.`)) return;
    const res = await fetch(`/api/wbs/${slug}`, { method: "DELETE" });
    if (res.ok) router.push("/wbs");
    else setMessage({ kind: "error", text: `Could not delete (status ${res.status}).` });
  }

  if (loadError) {
    return (
      <div className="page">
        <AppHeader />
        <div className="empty-state">
          {loadError}. <Link href="/wbs">Back to all WBS</Link>
        </div>
      </div>
    );
  }
  if (!row) {
    return (
      <div className="page">
        <AppHeader />
        <div className="empty-state">Loading…</div>
      </div>
    );
  }

  const { data } = row;
  const overall = statsFor(data.tasks);
  const linkOptions =
    row.masterProject && !masterNames.some((n) => normalizeName(n) === normalizeName(row.masterProject as string))
      ? [row.masterProject, ...masterNames]
      : masterNames;

  return (
    <div className="page">
      <AppHeader />

      <div className="wbs-head">
        <Link href="/wbs" className="back">
          &larr; All WBS
        </Link>
        <h2 className="wbs-title">{data.title}</h2>
        <div className="wbs-meta">
          {data.description && <span>{data.description}</span>}
          {data.unit && <span>{data.unit}</span>}
          <span>
            Updated {new Date(row.updatedAt).toLocaleString()}
            {row.updatedBy ? ` by ${row.updatedBy}` : ""}
          </span>
        </div>
        <div className="wbs-actions">
          <label className="inline-field">
            <span>Project Master</span>
            <select id="masterLink" value={row.masterProject ?? ""} onChange={(e) => changeLink(e.target.value)}>
              <option value="">Not linked</option>
              {linkOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button className="btn" onClick={onDelete}>
            Delete WBS
          </button>
        </div>
      </div>

      {message && <div className={`upload-status ${message.kind}`}>{message.text}</div>}

      <div className="summary">
        <span>
          Progress <b className="mono">{Math.round(overall.progress * 100)}%</b>
        </span>
        <span>
          <b className="mono">{data.tasks.length}</b> tasks
        </span>
        <span>
          <b className="mono">{data.units.length}</b> units
        </span>
        <span className="sep" aria-hidden="true" />
        <span>
          Planned <b className="mono">{formatHours(overall.plannedHours)} h</b>
        </span>
        <span className="ok">
          Done <b className="mono">{formatHours(overall.doneHours)} h</b>
        </span>
        <span className="warn">
          Remaining <b className="mono">{formatHours(overall.remainingHours)} h</b>
        </span>
        <span>
          Estimate incl. {Math.round(CONTINGENCY * 100)}% contingency{" "}
          <b className="mono">{formatHours(overall.estimateHours)} h</b>
        </span>
      </div>

      <div className="legend">
        <span>
          <i className="room done" /> Complete
        </span>
        <span>
          <i className="room na" /> Not required
        </span>
        <span>
          <i className="room todo" /> Pending
        </span>
        <span className="hint">Click a square to change it: Pending → Complete → Not required.</span>
      </div>

      <section className="team-panel">
        <div className="table-wrap">
          <table className="grid wbs-grid">
            <colgroup>
              <col className="wg-id" />
              <col className="wg-task" />
              <col className="wg-cat" />
              <col className="wg-owner" />
              <col className="wg-min" />
              <col className="wg-prog" />
              <col className="wg-units" />
            </colgroup>
            <thead>
              <tr>
                <th className="c-num">ID</th>
                <th>Task</th>
                <th>Category</th>
                <th>Owner</th>
                <th>Min / unit</th>
                <th>Progress</th>
                <th>Units</th>
              </tr>
            </thead>
            <tbody>
              {data.phases.map((phase) => {
                const phaseTasks = data.tasks
                  .map((task, index) => ({ task, index }))
                  .filter(({ task }) => task.phase === phase.id);
                const ps = statsFor(phaseTasks.map((x) => x.task));
                return [
                  <tr className="phase-row" key={`phase-${phase.id}`}>
                    <td className="c-num mono">{phase.id}</td>
                    <td colSpan={5}>{phase.title}</td>
                    <td className="mono">
                      {Math.round(ps.progress * 100)}% &middot; {formatHours(ps.plannedHours)} h planned
                    </td>
                  </tr>,
                  ...phaseTasks.map(({ task, index }) => {
                    const s = taskStats(task);
                    return (
                      <tr key={`${task.id}-${index}`}>
                        <td className="c-num mono">{task.id}</td>
                        <td className="c-proj">{task.title}</td>
                        <td>{task.category ?? ""}</td>
                        <td>{task.owner ?? ""}</td>
                        <td className="mono">{task.minutes ?? ""}</td>
                        <td>
                          <div className="bar-cell">
                            <div className="bar">
                              <span style={{ width: `${Math.round((s.progress ?? 0) * 100)}%` }} />
                            </div>
                            <span className="pct mono">{pct(s.progress)}</span>
                          </div>
                          <div className="sub mono">
                            {s.done}/{s.applicable}
                          </div>
                        </td>
                        <td>
                          <div className="strip">
                            {task.cells.map((cell, u) => {
                              const unit = data.units[u];
                              const startsGroup = u > 0 && unit.group !== data.units[u - 1].group;
                              const label = STATUS_LABEL[cell ?? "pending"];
                              return (
                                <button
                                  key={u}
                                  type="button"
                                  className={`room ${cell === "C" ? "done" : cell === "NR" ? "na" : "todo"}${
                                    startsGroup ? " gap" : ""
                                  }`}
                                  title={`${unit.label}${unit.group ? ` (${unit.group})` : ""}: ${label}`}
                                  aria-label={`${task.id} unit ${unit.label}: ${label}. Click to change.`}
                                  onClick={() => cycleCell(index, u)}
                                />
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    );
                  }),
                ];
              })}
            </tbody>
          </table>
        </div>
      </section>

      {data.units.length > 0 && (
        <div className="unit-groups">
          {[...new Set(data.units.map((u) => u.group).filter(Boolean))].map((g) => (
            <span key={g}>{g}</span>
          ))}
        </div>
      )}
    </div>
  );
}
