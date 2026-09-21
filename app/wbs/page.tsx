"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { formatHours, type WbsSummary } from "@/lib/wbs";

type Status = { kind: "idle" | "busy" | "ok" | "error"; message: string };

export default function WbsListPage() {
  const [items, setItems] = useState<WbsSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle", message: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const res = await fetch("/api/wbs", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ? `${body.error} (status ${res.status})` : `Server responded ${res.status}`);
      setItems(body);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load WBS projects");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (
      !window.confirm(
        "If a WBS with the same project title already exists, this replaces its tasks and statuses, including changes made in the app. Continue?"
      )
    ) {
      return;
    }
    setStatus({ kind: "busy", message: `Uploading ${file.name}…` });
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/wbs", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Upload failed (${res.status})`);
      const ignored = json.ignoredCodes ? ` ${json.ignoredCodes} unrecognised room codes were treated as pending.` : "";
      setStatus({
        kind: "ok",
        message: `${json.replaced ? "Updated" : "Added"} "${json.title}": ${json.tasks} tasks across ${json.units} units.${ignored}`,
      });
      await load();
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Upload failed" });
    }
  }

  const uploadButton = (
    <button className="btn" onClick={() => fileInputRef.current?.click()}>
      Upload WBS
    </button>
  );

  return (
    <div className="page">
      <AppHeader actions={uploadButton} />
      <input ref={fileInputRef} type="file" accept=".xlsx" hidden onChange={onFileSelected} />

      {status.kind !== "idle" && <div className={`upload-status ${status.kind}`}>{status.message}</div>}

      {loadError ? (
        <div className="empty-state">Could not load WBS projects &mdash; {loadError}</div>
      ) : !items ? (
        <div className="empty-state">Loading…</div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          No WBS uploaded yet. Upload a sheet laid out like your template: one file per project.
          <div style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={() => fileInputRef.current?.click()}>
              Upload WBS
            </button>
          </div>
        </div>
      ) : (
        <section className="team-panel">
          <div className="team-head">
            <h2>Work breakdown structures</h2>
            <span className="team-count mono">{items.length}</span>
          </div>
          <div className="table-wrap">
            <table className="grid wbs-list">
              <colgroup>
                <col className="wl-title" />
                <col className="wl-team" />
                <col className="wl-num" />
                <col className="wl-num" />
                <col className="wl-progress" />
                <col className="wl-hours" />
                <col className="wl-link" />
                <col className="wl-updated" />
              </colgroup>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Team</th>
                  <th>Units</th>
                  <th>Tasks</th>
                  <th>Progress</th>
                  <th>Est. man-hours</th>
                  <th>Project Master</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((w) => (
                  <tr key={w.slug}>
                    <td className="c-proj">
                      <Link href={`/wbs/${w.slug}`}>{w.title}</Link>
                      {w.description && <div className="sub">{w.description}</div>}
                    </td>
                    <td>{w.unit ?? ""}</td>
                    <td className="mono">{w.units}</td>
                    <td className="mono">{w.stats.tasks}</td>
                    <td>
                      <div className="bar-cell">
                        <div className="bar">
                          <span style={{ width: `${Math.round(w.stats.progress * 100)}%` }} />
                        </div>
                        <span className="pct mono">{Math.round(w.stats.progress * 100)}%</span>
                      </div>
                    </td>
                    <td className="mono">{formatHours(w.stats.estimateHours)} h</td>
                    <td>{w.masterProject ?? <span className="muted">Not linked</span>}</td>
                    <td className="c-date">
                      {new Date(w.updatedAt).toLocaleDateString()}
                      {w.updatedBy && <div className="sub">{w.updatedBy}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
