"use client";

import { useEffect, useRef, useState } from "react";

type Team = {
  name: string;
  header: string[] | null;
  rows: (string | number | null)[][];
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

function esc(s: unknown): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

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

function buildFieldBlocks(headerLabels: string[], values: (string | number | null)[], skipIdx: Set<number>) {
  const blocks: { label: string; val: string | number | null }[] = [];
  for (let i = 1; i < headerLabels.length; i++) {
    if (skipIdx.has(i)) continue;
    blocks.push({ label: headerLabels[i], val: values[i] });
  }
  return blocks;
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
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
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

  async function onUploadClick() {
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

  if (data.sheetOrder.length === 0) {
    return (
      <div className="page">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">PM</span>
            <div className="brand-text">
              <span className="eyebrow">Weekly Project Tracker</span>
              <h1>Project Master</h1>
            </div>
          </div>
          <div className="session-bar">
            {email && <span className="session-email mono">{email}</span>}
            <button className="btn" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </header>
        <div className="empty-state">
          No reports uploaded yet. Upload your projectmaster.xlsx to get started.
          <div style={{ marginTop: 14 }}>
            <button className="btn primary" onClick={onUploadClick}>
              Upload workbook
            </button>
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept=".xlsx" hidden onChange={onFileSelected} />
      </div>
    );
  }

  const sheet = data.sheets[selectedWeek] || data.sheets[data.sheetOrder[data.sheetOrder.length - 1]];
  const teams = (sheet?.teams || []).filter((t) => t.header && t.header.length);
  const validActiveTeam = teams.some((t) => t.name === activeTeam) ? activeTeam : "all";

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
      const ku = kuIdx >= 0 ? r[kuIdx] : null;
      const ns = nsIdx >= 0 ? r[nsIdx] : null;
      if (kuIdx >= 0 || nsIdx >= 0) {
        const st = rowStatus(ku, ns);
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
          <div className="brand-text">
            <span className="eyebrow">Weekly Project Tracker</span>
            <h1>Project Master</h1>
          </div>
        </div>
        <div className="controls">
          <label className="field">
            <span>Week</span>
            <select value={selectedWeek} onChange={(e) => setSelectedWeek(e.target.value)}>
              {data.sheetOrder.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="field search-field">
            <span>Search</span>
            <input
              type="search"
              placeholder="Project or lead…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        <div className="session-bar">
          {email && <span className="session-email mono">{email}</span>}
          <button className="btn" onClick={onUploadClick}>
            Upload new report
          </button>
          <button className="btn" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      {uploadStatus.kind !== "idle" && (
        <div
          className={`upload-status${uploadStatus.kind === "error" ? " error" : ""}${
            uploadStatus.kind === "ok" ? " success" : ""
          }`}
        >
          {uploadStatus.message}
        </div>
      )}

      <div className="meta-strip">
        <span>
          Reporting period <b>{sheet?.reportingDate || "—"}</b>
        </span>
        <span className="dot">&middot;</span>
        <span>
          Report generated <b>{sheet?.generatedDate || "—"}</b>
        </span>
      </div>

      <section className="kpis">
        <div className="kpi">
          <div className="num mono">{total}</div>
          <div className="lbl">Projects tracked</div>
        </div>
        <div className="kpi ok">
          <div className="num mono">{updated}</div>
          <div className="lbl">Updated this week</div>
        </div>
        <div className="kpi warn">
          <div className="num mono">{onHold}</div>
          <div className="lbl">On hold</div>
        </div>
        <div className="kpi crit">
          <div className="num mono">{issues}</div>
          <div className="lbl">Open issues flagged</div>
        </div>
      </section>

      <nav className="team-filter">
        <button
          className={`chip${validActiveTeam === "all" ? " active" : ""}`}
          onClick={() => setActiveTeam("all")}
        >
          All teams <span className="count mono">{total}</span>
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

          const skip = new Set<number>([projIdx]);
          if (leadIdx >= 0) skip.add(leadIdx);
          if (dateIdx >= 0) skip.add(dateIdx);

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
                <div className="team-head-left">
                  <h2>{team.name}</h2>
                  <span className="team-count mono">{rows.length}</span>
                </div>
                {flagCount > 0 && <span className="issue-flag">{flagCount} flagged</span>}
              </div>
              <div className="team-rows">
                {rows.length === 0 ? (
                  <div className="empty-state">No matching projects.</div>
                ) : (
                  rows.map((r, idx) => {
                    const projectName = r[projIdx] || "(untitled)";
                    const num = r[0];
                    const lead = leadIdx >= 0 ? r[leadIdx] : null;
                    const date = dateIdx >= 0 ? r[dateIdx] : null;
                    const ku = kuIdx >= 0 ? r[kuIdx] : null;
                    const ns = nsIdx >= 0 ? r[nsIdx] : null;
                    const hasStatus = kuIdx >= 0 || nsIdx >= 0;
                    const st = hasStatus ? rowStatus(ku, ns) : null;
                    const blocks = buildFieldBlocks(h, r, skip);

                    const metaBits: string[] = [];
                    if (lead) metaBits.push(`Lead ${lead}`);
                    if (date) metaBits.push(`Since ${date}`);

                    return (
                      <div className="project-row" key={`${team.name}-${idx}`}>
                        <div className="row-head">
                          <div className="row-title-block">
                            <span className="row-num mono">{typeof num === "number" ? num : ""}</span>
                            <div className="row-title-wrap">
                              <div className="row-title">{String(projectName)}</div>
                              {metaBits.length > 0 && <div className="row-meta">{metaBits.join(" · ")}</div>}
                            </div>
                          </div>
                          {st && <span className={`status-pill ${st.cls}`}>{st.label}</span>}
                        </div>
                        {blocks.length > 0 && (
                          <div className={`row-body${blocks.length > 1 ? "" : " single"}`}>
                            {blocks.map((b, bi) => (
                              <div className="field-block" key={bi}>
                                <div className="f-label">{b.label}</div>
                                <div className={`f-value${isBlank(b.val) ? " empty" : ""}`}>
                                  {isBlank(b.val) ? "—" : String(b.val)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              {(team.criticalIssues?.length > 0 || team.escalations?.length > 0) && (
                <div className="callouts">
                  {team.criticalIssues?.length > 0 && (
                    <div className="callout">
                      <div className="c-label">Critical issues or delays</div>
                      <ul>
                        {team.criticalIssues.map((i, ii) => (
                          <li key={ii}>{i}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {team.escalations?.length > 0 && (
                    <div className="callout warn">
                      <div className="c-label">Escalations or support needed</div>
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
        Source: projectmaster.xlsx &middot; {data.sheetOrder.length} weekly reports on file
        {data.lastUploadedAt && (
          <>
            {" "}
            &middot; last updated {new Date(data.lastUploadedAt).toLocaleString()}
            {data.lastUploadedBy ? ` by ${data.lastUploadedBy}` : ""}
          </>
        )}
      </footer>

      <input ref={fileInputRef} type="file" accept=".xlsx" hidden onChange={onFileSelected} />
    </div>
  );
}
