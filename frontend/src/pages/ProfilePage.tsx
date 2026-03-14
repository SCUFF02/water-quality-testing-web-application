import { useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";

type SampleEntry = { sampleName: string; region: string };

type FormData = {
  samples?:    SampleEntry[];
  sources?:    string[];
  liquid?:     string;
  liquids?:    string[];
  parameters?: { name: string; target: string; unit: string }[];
  manualOnly?: boolean;
};

type DataPoint = {
  x: number; y: number;
  sampleName?: string; region?: string; parameter?: string;
};

type SavedProject = {
  userId:        string;
  projectName:   string;
  systemType:    "multisensor" | "dosing" | "merged";
  timestamp:     string;
  formData:      FormData;
  manualData:    DataPoint[];
  collectedData: DataPoint[];
  mergedFrom?:   string[];
};

export default function ProfilePage() {
  const nav = useNavigate();
  const [search, setSearch]             = useState("");
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeA, setMergeA]             = useState("");
  const [mergeB, setMergeB]             = useState("");
  const [mergeName, setMergeName]       = useState("");
  const [mergeError, setMergeError]     = useState("");

  const [allProjects, setAllProjects] = useState<SavedProject[]>(() =>
    JSON.parse(localStorage.getItem("savedProjects") || "[]")
  );

  const multisensorRef = useRef<HTMLDivElement>(null);
  const dosingRef      = useRef<HTMLDivElement>(null);
  const mergedRef      = useRef<HTMLDivElement>(null);

  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem("currentUser") || "{}"); }
    catch { return {}; }
  })();
  const username: string = currentUser.username || "user";

  // ── Search: matches project name OR any sample/region name ──────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allProjects;
    return allProjects.filter((p) => {
      if (p.projectName.toLowerCase().includes(q)) return true;
      // search samples by name or region
      if (p.formData.samples?.some(
        (s) => s.sampleName.toLowerCase().includes(q) || s.region.toLowerCase().includes(q)
      )) return true;
      // search manual data points by sampleName or region too
      if (p.manualData?.some(
        (d) => d.sampleName?.toLowerCase().includes(q) || d.region?.toLowerCase().includes(q)
      )) return true;
      // search sources for dosing
      if (p.formData.sources?.some((s) => s.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [search, allProjects]);

  const multisensorProjects = filtered.filter((p) => p.systemType === "multisensor");
  const dosingProjects      = filtered.filter((p) => p.systemType === "dosing");
  const mergedProjects      = filtered.filter((p) => p.systemType === "merged");

  // non-merged projects available to merge
  const mergeableProjects = allProjects.filter((p) => p.systemType !== "merged");

  function scrollTo(ref: React.RefObject<HTMLDivElement | null>) {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("currentUser");
    nav("/signin", { replace: true });
  }

  function formatDate(ts: string) {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  // ── Merge logic ─────────────────────────────────────────────────────────
  function openMergeModal() {
    setMergeA("");
    setMergeB("");
    setMergeName("");
    setMergeError("");
    setMergeModalOpen(true);
  }

  function doMerge() {
    const trimmedName = mergeName.trim();
    if (!mergeA || !mergeB) { setMergeError("Please select two projects to merge."); return; }
    if (mergeA === mergeB)  { setMergeError("Please select two different projects."); return; }
    if (!trimmedName)       { setMergeError("Merged project name is required."); return; }
    if (allProjects.some((p) => p.projectName.toLowerCase() === trimmedName.toLowerCase())) {
      setMergeError("A project with this name already exists."); return;
    }

    const projA = allProjects.find((p) => p.projectName === mergeA)!;
    const projB = allProjects.find((p) => p.projectName === mergeB)!;

    // Merge samples (deduplicate by sampleName)
    const samplesA: SampleEntry[] = projA.formData.samples || [];
    const samplesB: SampleEntry[] = projB.formData.samples || [];
    const seenSamples = new Set(samplesA.map((s) => s.sampleName.toLowerCase()));
    const mergedSamples = [
      ...samplesA,
      ...samplesB.filter((s) => !seenSamples.has(s.sampleName.toLowerCase())),
    ];

    // Merge sources (dosing)
    const sourcesA = projA.formData.sources || [];
    const sourcesB = projB.formData.sources || [];
    const seenSources = new Set(sourcesA.map((s) => s.toLowerCase()));
    const mergedSources = [
      ...sourcesA,
      ...sourcesB.filter((s) => !seenSources.has(s.toLowerCase())),
    ];

    // Re-index data points so x values are continuous
    const reindex = (points: DataPoint[], offset: number): DataPoint[] =>
      points.map((pt, i) => ({ ...pt, x: offset + i + 1 }));

    const mergedManual    = [
      ...reindex(projA.manualData    || [], 0),
      ...reindex(projB.manualData    || [], (projA.manualData    || []).length),
    ];
    const mergedCollected = [
      ...reindex(projA.collectedData || [], 0),
      ...reindex(projB.collectedData || [], (projA.collectedData || []).length),
    ];

    const newProject: SavedProject = {
      userId:        username,
      projectName:   trimmedName,
      systemType:    "merged",
      timestamp:     new Date().toISOString(),
      formData: {
        samples:  mergedSamples,
        sources:  mergedSources,
        liquids:  [...(projA.formData.liquids || []), ...(projB.formData.liquids || [])].filter((v, i, a) => a.indexOf(v) === i),
        manualOnly: false,
      },
      manualData:    mergedManual,
      collectedData: mergedCollected,
      mergedFrom:    [mergeA, mergeB],
    };

    const updated = [...allProjects, newProject];
    setAllProjects(updated);
    localStorage.setItem("savedProjects", JSON.stringify(updated));
    setMergeModalOpen(false);
  }
  // ────────────────────────────────────────────────────────────────────────

  return (
    <div className="profile-page">

      {/* TOPBAR */}
      <header className="topbar">
        <div className="logo">
          <img src="/logocerte.png" alt="CERTE logo" />
          <strong>CERTE</strong>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button type="button" className="back-btn" onClick={() => nav("/app")}>← Dashboard</button>
          <button className="logout-btn" type="button" onClick={logout}>Logout</button>
        </div>
      </header>

      <div className="profile-layout">

        {/* SIDENAV */}
        <aside className="profile-sidenav">
          <div className="profile-avatar">
            <div className="avatar-circle">{username.charAt(0).toUpperCase()}</div>
            <div className="avatar-name">{username}</div>
            <div className="avatar-sub">
              {allProjects.length} project{allProjects.length !== 1 ? "s" : ""}
            </div>
          </div>

          <nav className="sidenav-links">
            <p className="sidenav-label">Jump to</p>
            <button type="button" className="sidenav-link" onClick={() => scrollTo(multisensorRef)}>
              <span className="sidenav-dot multisensor-dot" />
              MultiSensor
              <span className="sidenav-count">{allProjects.filter((p) => p.systemType === "multisensor").length}</span>
            </button>
            <button type="button" className="sidenav-link" onClick={() => scrollTo(dosingRef)}>
              <span className="sidenav-dot dosing-dot" />
              Dosing
              <span className="sidenav-count">{allProjects.filter((p) => p.systemType === "dosing").length}</span>
            </button>
            <button type="button" className="sidenav-link" onClick={() => scrollTo(mergedRef)}>
              <span className="sidenav-dot merged-dot" />
              Merged
              <span className="sidenav-count">{allProjects.filter((p) => p.systemType === "merged").length}</span>
            </button>

            <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
              <button type="button" className="merge-trigger-btn" onClick={openMergeModal}>
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Merge projects
              </button>
            </div>
          </nav>
        </aside>

        {/* MAIN */}
        <main className="profile-main">

          {/* Search */}
          <div className="profile-search-wrap">
            <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              className="profile-search"
              type="text"
              placeholder="Search by project name, sample or region…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button type="button" className="search-clear" onClick={() => setSearch("")}>✕</button>
            )}
          </div>

          {filtered.length === 0 && (
            <p className="no-data" style={{ marginTop: 24 }}>No projects match "{search}".</p>
          )}

          {/* MultiSensor */}
          <div ref={multisensorRef} className="profile-section">
            <div className="profile-section-header">
              <span className="section-dot multisensor-dot" />
              <h2>MultiSensor Projects</h2>
              <span className="section-count">{multisensorProjects.length}</span>
            </div>
            {multisensorProjects.length === 0 ? (
              <p className="no-data">No MultiSensor projects{search ? " matching your search" : ""}.</p>
            ) : (
              <div className="profile-projects-grid">
                {multisensorProjects.map((p, i) => {
                  const sampleCount = p.formData.samples?.length ?? 0;
                  return (
                    <div key={i} className="profile-project-card multisensor-card"
                      onClick={() => nav(`/project/${encodeURIComponent(p.projectName)}`)}>
                      <div className="card-top">
                        <span className="card-type-badge multisensor">MultiSensor</span>
                        <span className="card-date">{formatDate(p.timestamp)}</span>
                      </div>
                      <div className="card-name">{p.projectName}</div>
                      <div className="card-meta">
                        {sampleCount > 0 ? `${sampleCount} sample${sampleCount !== 1 ? "s" : ""}` : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Dosing */}
          <div ref={dosingRef} className="profile-section">
            <div className="profile-section-header">
              <span className="section-dot dosing-dot" />
              <h2>Dosing Projects</h2>
              <span className="section-count">{dosingProjects.length}</span>
            </div>
            {dosingProjects.length === 0 ? (
              <p className="no-data">No Dosing projects{search ? " matching your search" : ""}.</p>
            ) : (
              <div className="profile-projects-grid">
                {dosingProjects.map((p, i) => {
                  const activeSources = p.formData.sources?.filter((s) => s.trim()).length ?? 0;
                  const liquid = p.formData.liquid ?? "";
                  return (
                    <div key={i} className="profile-project-card dosing-card"
                      onClick={() => nav(`/project/${encodeURIComponent(p.projectName)}`)}>
                      <div className="card-top">
                        <span className="card-type-badge dosing">Dosing</span>
                        <span className="card-date">{formatDate(p.timestamp)}</span>
                      </div>
                      <div className="card-name">{p.projectName}</div>
                      <div className="card-meta">
                        {activeSources > 0 ? `${activeSources} source${activeSources !== 1 ? "s" : ""}` : "—"}
                        {liquid ? ` · ${liquid}` : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Merged */}
          <div ref={mergedRef} className="profile-section">
            <div className="profile-section-header">
              <span className="section-dot merged-dot" />
              <h2>Merged Projects</h2>
              <span className="section-count">{mergedProjects.length}</span>
              <button type="button" className="merge-trigger-btn" style={{ marginLeft: "auto" }} onClick={openMergeModal}>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                New merge
              </button>
            </div>
            {mergedProjects.length === 0 ? (
              <div className="merge-empty">
                <p>No merged projects yet.</p>
                <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
                  Combine two projects into one to compare their samples side-by-side.
                </p>
                <button type="button" className="merge-trigger-btn" style={{ marginTop: 12 }} onClick={openMergeModal}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Merge two projects
                </button>
              </div>
            ) : (
              <div className="profile-projects-grid">
                {mergedProjects.map((p, i) => {
                  const sampleCount = p.formData.samples?.length ?? 0;
                  return (
                    <div key={i} className="profile-project-card merged-card"
                      onClick={() => nav(`/project/${encodeURIComponent(p.projectName)}`)}>
                      <div className="card-top">
                        <span className="card-type-badge merged">Merged</span>
                        <span className="card-date">{formatDate(p.timestamp)}</span>
                      </div>
                      <div className="card-name">{p.projectName}</div>
                      {p.mergedFrom && (
                        <div className="card-merged-from">
                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
                            <path d="M18 9a9 9 0 0 1-9 9"/>
                          </svg>
                          {p.mergedFrom[0]} + {p.mergedFrom[1]}
                        </div>
                      )}
                      <div className="card-meta">
                        {sampleCount > 0 ? `${sampleCount} sample${sampleCount !== 1 ? "s" : ""}` : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </main>
      </div>

      {/* MERGE MODAL */}
      {mergeModalOpen && (
        <div className="modal-overlay" onClick={() => setMergeModalOpen(false)}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <h3>Merge two projects</h3>
            <p style={{ textAlign: "center", fontSize: 13, color: "var(--ink-2)", marginBottom: 20 }}>
              Samples and data from both projects will be combined into one new project.
            </p>

            {mergeableProjects.length < 2 ? (
              <p className="form-error" style={{ textAlign: "center" }}>
                You need at least two non-merged projects to use this feature.
              </p>
            ) : (
              <>
                <div className="merge-selects-row">
                  <div className="merge-select-col">
                    <label htmlFor="mergeA">First project</label>
                    <select
                      id="mergeA"
                      className="modal-select"
                      value={mergeA}
                      onChange={(e) => { setMergeA(e.target.value); setMergeError(""); }}
                    >
                      <option value="">— Select project —</option>
                      {mergeableProjects.map((p) => (
                        <option key={p.projectName} value={p.projectName} disabled={p.projectName === mergeB}>
                          {p.projectName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="merge-plus-icon">+</div>

                  <div className="merge-select-col">
                    <label htmlFor="mergeB">Second project</label>
                    <select
                      id="mergeB"
                      className="modal-select"
                      value={mergeB}
                      onChange={(e) => { setMergeB(e.target.value); setMergeError(""); }}
                    >
                      <option value="">— Select project —</option>
                      {mergeableProjects.map((p) => (
                        <option key={p.projectName} value={p.projectName} disabled={p.projectName === mergeA}>
                          {p.projectName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <label htmlFor="mergeName">New merged project name</label>
                <input
                  id="mergeName"
                  type="text"
                  placeholder="e.g. Combined Analysis Q1"
                  value={mergeName}
                  onChange={(e) => { setMergeName(e.target.value); setMergeError(""); }}
                />
              </>
            )}

            {mergeError && <p className="form-error">{mergeError}</p>}

            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button
                type="button"
                onClick={doMerge}
                disabled={mergeableProjects.length < 2}
              >
                Merge projects
              </button>
              <button type="button" onClick={() => setMergeModalOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

