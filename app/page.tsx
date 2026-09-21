"use client";

import { useEffect, useRef, useState } from "react";

type Cell = string | number | null;

type Team = {
  name: string;
  header: string[] | null;
  rows: Cell[][];
  criticalIssues: string[];
  escalations: string[];
};

type Sheet = { reportingDate: string | null; generatedDate: string | null; teams: Team[] };

type WorkbookData = {
  sheetOrder: string[];
  sheets: Record<string, Sheet>;
  lastUploadedAt: string | null;
  lastUploadedBy: string | null;
};

function isBlank(v: unknown): boolean {
  if (!v) return true;
  const t = String(v).trim().toLowerCase();
  return t === "" || t === "none" || t === "-" || t === "n/a" || t === "no plotted tasks";
}

function findField(headerLabels: string[], re: RegExp): number {
  for (let i = 1; i < headerLabels.length; i++) {
    if (re.test(headerLabels[i])) return i;
  }
  return -1;
}

function rowStatus(keyUpdates: unknown, nextSteps: unknown): { label: string; cls: string } {
  const ku = String(keyUpdates || "").toLowerCase();
  const ns = String(nextSteps || "").toLowerCase();
  if (ku.includes("complet")) return { label: "Completed", cls: "ok" };
  if (ku.includes("on-hold") || ku.includes("on hold") || ns.includes("on-hold") || ns.includes("on hold")) {
    return { label: "On hold", cls: "warn" };
  }
  if (!isBlank(keyUpdates)) return { label: "Updated", cls: "ok" };
  if (isBlank(keyUpdates) && isBlank(nextSteps)) return { label: "No update", cls: "idle" };
  return { label: "Tracking", cls: "idle" };
}

export default function DashboardPage() {
  const [data, setData] = useState<WorkbookData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<string>("");
  const [query, setQuery] = useState("");
  const [activeTeam, setActiveTeam] = useState("all");
  const [uploadStatus, setUploadStatus] = useState<{ kind: "idle" | "busy" | "ok" | "error"; message: string }>({
    kind: "idle",
    message: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadData() {
    try {
      const res = await fetch("/api/data", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ? `${body.error} (status ${res.status})` : `Server responded ${res.status}`);
      }
      const json: WorkbookData = await res.json();
      setData(json);
      setLoadError(null);
      if (json.sheetOrder.length) {
        setSelectedWeek((prev) => (json.sheets[prev] ? prev : json.sheetOrder[json.sheetOrder.length - 1]));
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load data");
    }
  }

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => setEmail(j.email));
    loadData();
  }, []);

  async function onSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  function onUploadClick() {
    fileInputRef.current?.click();
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadStatus({ kind: "busy", message: `Uploading ${file.name}…` });
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Upload failed (${res.status})`);
      setUploadStatus({ kind: "ok", message: `Loaded ${json.weeks} weekly reports from ${file.name}.` });
      await loadData();
    } catch (err) {
      setUploadStatus({ kind: "error", message: err instanceof Error ? err.message : "Upload failed" });
    }
  }

  const uploadInput = <input ref={fileInputRef} type="file" accept=".xlsx" hidden onChange={onFileSelected} />;

  if (loadError) {
    return (
      <div className="page">
        <div className="empty-state">Could not load the dashboard data &mdash; {loadError}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page">
        <div className="empty-state">Loading…</div>
      </div>
    );
  }

  const sessionBar = (
    <div className="session-bar">
      {email && <span className="session-email mono">{email}</span>}
      <button className="btn" onClick={onUploadClick}>
        Upload new report
      </button>
      <button className="btn" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  );

  if (data.sheetOrder.length === 0) {
    return (
      <div className="page">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">PM</span>
            <h1>Project Master</h1>
          </div>
          {sessionBar}
        </header>
        {uploadStatus.kind !== "idle" && (
          <div className={`upload-status ${uploadStatus.kind}`}>{uploadStatus.message}</div>
        )}
        <div className="empty-state">
          No reports uploaded yet. Upload your projectmaster.xlsx to get started.
          <div style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={onUploadClick}>
              Upload workbook
            </button>
          </div>
        </div>
        {uploadInput}
      </div>
    );
  }

  const sheet = data.sheets[selectedWeek] || data.sheets[data.sheetOrder[data.sheetOrder.length - 1]];
  const teams = (sheet?.teams || []).filter((t) => t.header && t.header.length);
  const validActiveTeam = teams.some((t) => t.name === activeTeam) ? activeTeam : "all";

  // Same columns in every table of the week, so widths line up from team to team.
  const layout = {
    lead: teams.some((t) => findField(t.header as string[], /lead/i) >= 0),
    date: teams.some((t) => findField(t.header as string[], /date/i) >= 0),
    status: teams.some((t) => findField(t.header as string[], /key updat|next step/i) >= 0),
  };

  let total = 0;
  let updated = 0;
  let onHold = 0;
  let issues = 0;
  const teamCounts: { name: string; count: number }[] = [];

  teams.forEach((team) => {
    const h = team.header as string[];
    const kuIdx = findField(h, /key updat/i);
    const nsIdx = findField(h, /next step/i);
    (team.rows || []).forEach((r) => {
      total++;
      if (kuIdx >= 0 || nsIdx >= 0) {
        const st = rowStatus(kuIdx >= 0 ? r[kuIdx] : null, nsIdx >= 0 ? r[nsIdx] : null);
        if (st.cls === "ok") updated++;
        if (st.cls === "warn") onHold++;
      }
    });
    issues += (team.criticalIssues || []).length + (team.escalations || []).length;
    teamCounts.push({ name: team.name, count: (team.rows || []).length });
  });

  const q = query.trim().toLowerCase();
  const visibleTeams = teams.filter((t) => validActiveTeam === "all" || t.name === validActiveTeam);

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">PM</span>
          <h1>Project Master</h1>
        </div>
        <div className="controls">
          <select aria-label="Week" value={selectedWeek} onChange={(e) => setSelectedWeek(e.target.value)}>
            {data.sheetOrder.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            type="search"
            aria-label="Search projects or leads"
            placeholder="Search project or lead…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {sessionBar}
      </header>

      {uploadStatus.kind !== "idle" && <div className={`upload-status ${uploadStatus.kind}`}>{uploadStatus.message}</div>}

      <div className="summary">
        <span>
          Reporting period <b>{sheet?.reportingDate || "—"}</b>
        </span>
        <span>
          Generated <b>{sheet?.generatedDate || "—"}</b>
        </span>
        <span className="sep" aria-hidden="true" />
        <span>
          <b className="mono">{total}</b> projects
        </span>
        <span className="ok">
          <b className="mono">{updated}</b> updated
        </span>
        <span className="warn">
          <b className="mono">{onHold}</b> on hold
        </span>
        <span className="crit">
          <b className="mono">{issues}</b> issues flagged
        </span>
      </div>

      <nav className="team-filter">
        <button className={`chip${validActiveTeam === "all" ? " active" : ""}`} onClick={() => setActiveTeam("all")}>
          All <span className="count mono">{total}</span>
        </button>
        {teamCounts.map((t) => (
          <button
            key={t.name}
            className={`chip${validActiveTeam === t.name ? " active" : ""}`}
            onClick={() => setActiveTeam(t.name)}
          >
            {t.name} <span className="count mono">{t.count}</span>
          </button>
        ))}
      </nav>

      <main>
        {visibleTeams.map((team) => {
          const h = team.header as string[];
          const projIdx = (() => {
            const i = findField(h, /project|app\b/i);
            return i >= 0 ? i : 1;
          })();
          const leadIdx = findField(h, /lead/i);
          const dateIdx = findField(h, /date/i);
          const kuIdx = findField(h, /key updat/i);
          const nsIdx = findField(h, /next step/i);
          const hasStatus = kuIdx >= 0 || nsIdx >= 0;

          // Everything except project/lead/date and the dropped "Next steps" column is content.
          const contentIdxs: number[] = [];
          for (let i = 1; i < h.length; i++) {
            if (i === projIdx || i === leadIdx || i === dateIdx || i === nsIdx) continue;
            contentIdxs.push(i);
          }
          const contentLabel = contentIdxs.length === 1 ? h[contentIdxs[0]] : "Key updates";

          let rows = team.rows || [];
          if (q) {
            rows = rows.filter((r) => {
              const proj = String(r[projIdx] || "").toLowerCase();
              const lead = leadIdx >= 0 ? String(r[leadIdx] || "").toLowerCase() : "";
              return proj.includes(q) || lead.includes(q);
            });
          }
          if (q && rows.length === 0) return null;

          const flagCount = (team.criticalIssues || []).length + (team.escalations || []).length;

          return (
            <section className="team-panel" key={team.name}>
              <div className="team-head">
                <h2>{team.name}</h2>
                <span className="team-count mono">{rows.length}</span>
                {flagCount > 0 && <span className="issue-flag">{flagCount} flagged</span>}
              </div>

              {rows.length === 0 ? (
                <div className="empty-state">No projects.</div>
              ) : (
                <div className="table-wrap">
                  <table className="grid">
                    <colgroup>
                      <col className="col-num" />
                      <col className="col-proj" />
                      {layout.lead && <col className="col-lead" />}
                      {layout.date && <col className="col-date" />}
                      {layout.status && <col className="col-status" />}
                      <col className="col-content" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="c-num">#</th>
                        <th className="c-proj">{h[projIdx]}</th>
                        {layout.lead && <th className="c-lead">Lead</th>}
                        {layout.date && <th className="c-date">Start date</th>}
                        {layout.status && <th className="c-status">Status</th>}
                        <th className="c-content">{contentLabel}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, idx) => {
                        const st = hasStatus ? rowStatus(kuIdx >= 0 ? r[kuIdx] : null, nsIdx >= 0 ? r[nsIdx] : null) : null;
                        const contentText = contentIdxs
                          .filter((i) => !isBlank(r[i]))
                          .map((i) => (contentIdxs.length > 1 ? `${h[i]}: ${r[i]}` : String(r[i])))
                          .join("\n");
                        return (
                          <tr key={`${team.name}-${idx}`}>
                            <td className="c-num mono">{typeof r[0] === "number" ? r[0] : ""}</td>
                            <td className="c-proj">{String(r[projIdx] || "(untitled)")}</td>
                            {layout.lead && <td className="c-lead">{leadIdx >= 0 ? r[leadIdx] ?? "" : ""}</td>}
                            {layout.date && <td className="c-date mono">{dateIdx >= 0 ? r[dateIdx] ?? "" : ""}</td>}
                            {layout.status && (
                              <td className="c-status">
                                {st && <span className={`st ${st.cls}`}>{st.label}</span>}
                              </td>
                            )}
                            <td className={`c-content${contentText ? "" : " empty"}`}>{contentText || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {flagCount > 0 && (
                <div className="callouts">
                  {team.criticalIssues.length > 0 && (
                    <div className="callout">
                      <b>Critical issues or delays</b>
                      <ul>
                        {team.criticalIssues.map((i, ii) => (
                          <li key={ii}>{i}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {team.escalations.length > 0 && (
                    <div className="callout warn">
                      <b>Escalations or support needed</b>
                      <ul>
                        {team.escalations.map((i, ii) => (
                          <li key={ii}>{i}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </main>

      <footer className="page-footer">
        {data.sheetOrder.length} weekly reports on file
        {data.lastUploadedAt && (
          <>
            {" "}
            &middot; last updated {new Date(data.lastUploadedAt).toLocaleString()}
            {data.lastUploadedBy ? ` by ${data.lastUploadedBy}` : ""}
          </>
        )}
      </footer>

      {uploadInput}
    </div>
  );
}
