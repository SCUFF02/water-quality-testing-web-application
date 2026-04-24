import { api } from "../api/api";
import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Profile Page
 * 
 * Now fetches the current user's projects from the backend database.
 * Falls back to localStorage for merged projects (which are local-only for now).
 */

type SampleEntry = { sampleName: string; region: string };

type BackendProject = {
  id:          string;
  name:        string;
  system_type: "multisensor" | "dosing";
  created_at:  string;
  manual_only: boolean;
  samples:     { id: string; sample_name: string; region: string }[];
};

type BackendMerged = {
  id:         string;
  name:       string;
  created_at: string;
  projectName?: string;
  mergedFrom?:  string[];
  formData?:   { samples?: SampleEntry[] };
};

export default function ProfilePage() {
  const nav = useNavigate();
  const [search, setSearch] = useState("");
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeA, setMergeA] = useState("");
  const [mergeB, setMergeB] = useState("");
  const [mergeName, setMergeName] = useState("");
  const [mergeError, setMergeError] = useState("");

  // Projects from backend
  const [backendMultisensor, setBackendMultisensor] = useState<BackendProject[]>([]);
  const [backendDosing, setBackendDosing]           = useState<BackendProject[]>([]);
  const [loading, setLoading]                       = useState(true);

  // Merged projects stay in localStorage (they're local combinations)
  const [mergedProjects, setMergedProjects] = useState<BackendMerged[]>([]);

  // Load merged projects from backend
  useEffect(() => {
    api.get("/merged/projects")
      .then(r => r.ok ? r.json() : [])
      .then(setMergedProjects)
      .catch(() => {});
  }, []);


  const multisensorRef = useRef<HTMLDivElement>(null);
  const dosingRef      = useRef<HTMLDivElement>(null);
  const mergedRef      = useRef<HTMLDivElement>(null);

  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem("currentUser") || "{}"); }
    catch { return {}; }
  })();
  const username: string = currentUser.username || "user";

  // Fetch projects from backend on load
  useEffect(() => {
    if (!localStorage.getItem("token")) { setLoading(false); return; }

    Promise.all([
      api.get("/multisensor/projects").then((r: Response) => r.ok ? r.json() : []),
      api.get("/dosing/projects").then((r: Response) => r.ok ? r.json() : []),
    ])
    .then(([ms, dos]) => {
      setBackendMultisensor(ms);
      setBackendDosing(dos);
    })
    .catch(() => {})
    .finally(() => setLoading(false));
  }, []);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("currentUser");
    nav("/signin", { replace: true });
  }

  function formatDate(ts: string) {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  function scrollTo(ref: React.RefObject<HTMLDivElement | null>) {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Filter backend projects by search
  const filteredMS = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return backendMultisensor;
    return backendMultisensor.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.samples.some(s => s.sample_name.toLowerCase().includes(q) || s.region.toLowerCase().includes(q))
    );
  }, [search, backendMultisensor]);

  const filteredDos = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return backendDosing;
    return backendDosing.filter(p => p.name.toLowerCase().includes(q));
  }, [search, backendDosing]);

  const filteredMerged = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return mergedProjects;
    return mergedProjects.filter((p: BackendMerged) =>
      p.name.toLowerCase().includes(q)
    );
  }, [search, mergedProjects]);

  const totalCount = backendMultisensor.length + backendDosing.length + mergedProjects.length;

  // ── Merge logic (local only — merges localStorage projects) ────────────
  const mergeableProjects = [
    ...backendMultisensor.map(p => ({ id: p.id, projectName: p.name, systemType: "multisensor" as const })),
    ...backendDosing.map(p => ({ id: p.id, projectName: p.name, systemType: "dosing" as const })),
  ];

  function openMergeModal() {
    setMergeA(""); setMergeB(""); setMergeName(""); setMergeError("");
    setMergeModalOpen(true);
  }

  async function doMerge() {
    const trimmedName = mergeName.trim();
    if (!mergeA || !mergeB)   { setMergeError("Please select two projects."); return; }
    if (mergeA === mergeB)    { setMergeError("Please select two different projects."); return; }
    if (!trimmedName)         { setMergeError("Merged project name is required."); return; }
    setMergeError("");
    try {
      const res = await api.post("/merged/projects", {
        name:         trimmedName,
        project_a_id: mergeA,
        project_b_id: mergeB,
      });
      if (!res.ok) {
        const d = await res.json();
        setMergeError(d.detail || "Could not create merged project.");
        return;
      }
      const created: BackendMerged = await res.json();
      setMergedProjects(prev => [...prev, created]);
      setMergeModalOpen(false);
    } catch { setMergeError("Could not connect to server."); }
  }

  async function renameMerged(p: BackendMerged, e: React.MouseEvent) {
    e.stopPropagation();
    const newName = window.prompt("New name:", p.name);
    if (!newName || !newName.trim() || newName.trim() === p.name) return;
    const res = await api.patch(`/merged/projects/${p.id}`, { name: newName.trim() });
    if (!res.ok) { const d = await res.json(); alert(d.detail || "Could not rename."); return; }
    setMergedProjects(prev => prev.map(m => m.id === p.id ? { ...m, name: newName.trim() } : m));
  }

  async function deleteMerged(p: BackendMerged, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    const res = await api.del(`/merged/projects/${p.id}`);
    if (!res.ok) { alert("Could not delete."); return; }
    setMergedProjects(prev => prev.filter(m => m.id !== p.id));
  }

  return (
    <div className="profile-page">
      <header className="topbar">
        <div className="topbar-left">
          <div className="logo" style={{ cursor: "pointer" }} onClick={() => nav("/app")}>
            <img src="/logocerte.png" alt="CERTE logo" />
            <strong>CERTE</strong>
          </div>
          <button type="button" className="back-btn" onClick={() => nav("/app")}>← Dashboard</button>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="logout-btn" type="button" onClick={logout}>Logout</button>
        </div>
      </header>

      <div className="profile-layout">
        <aside className="profile-sidenav">
          <div className="profile-avatar">
            <div className="avatar-circle">{username.charAt(0).toUpperCase()}</div>
            <div className="avatar-name">{username}</div>
            <div className="avatar-sub">
              {loading ? "Loading…" : `${totalCount} project${totalCount !== 1 ? "s" : ""}`}
            </div>
          </div>

          <nav className="sidenav-links">
            <p className="sidenav-label">Jump to</p>
            <button type="button" className="sidenav-link" onClick={() => scrollTo(multisensorRef)}>
              <span className="sidenav-dot multisensor-dot" />
              MultiSensor
              <span className="sidenav-count">{backendMultisensor.length}</span>
            </button>
            <button type="button" className="sidenav-link" onClick={() => scrollTo(dosingRef)}>
              <span className="sidenav-dot dosing-dot" />
              Dosing
              <span className="sidenav-count">{backendDosing.length}</span>
            </button>
            <button type="button" className="sidenav-link" onClick={() => scrollTo(mergedRef)}>
              <span className="sidenav-dot merged-dot" />
              Merged
              <span className="sidenav-count">{mergedProjects.length}</span>
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

        <main className="profile-main">
          <div className="profile-search-wrap">
            <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input className="profile-search" type="text"
              placeholder="Search by project name, sample or region…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button type="button" className="search-clear" onClick={() => setSearch("")}>✕</button>}
          </div>

          {loading && <p className="no-data" style={{ marginTop: 24 }}>Loading projects…</p>}

          {/* MultiSensor */}
          <div ref={multisensorRef} className="profile-section">
            <div className="profile-section-header">
              <span className="section-dot multisensor-dot" />
              <h2>MultiSensor Projects</h2>
              <span className="section-count">{filteredMS.length}</span>
            </div>
            {filteredMS.length === 0 ? (
              <p className="no-data">No MultiSensor projects{search ? " matching your search" : ""}.</p>
            ) : (
              <div className="profile-projects-grid">
                {filteredMS.map((p) => (
                  <div key={p.id} className="profile-project-card multisensor-card"
                    onClick={() => nav(`/project/${encodeURIComponent(p.id)}`)}>
                    <div className="card-top">
                      <span className="card-type-badge multisensor">MultiSensor</span>
                      <span className="card-date">{formatDate(p.created_at)}</span>
                    </div>
                    <div className="card-name">{p.name}</div>
                    <div className="card-meta">
                      {p.samples.length > 0 ? `${p.samples.length} sample${p.samples.length !== 1 ? "s" : ""}` : "—"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Dosing */}
          <div ref={dosingRef} className="profile-section">
            <div className="profile-section-header">
              <span className="section-dot dosing-dot" />
              <h2>Dosing Projects</h2>
              <span className="section-count">{filteredDos.length}</span>
            </div>
            {filteredDos.length === 0 ? (
              <p className="no-data">No Dosing projects{search ? " matching your search" : ""}.</p>
            ) : (
              <div className="profile-projects-grid">
                {filteredDos.map((p) => (
                  <div key={p.id} className="profile-project-card dosing-card"
                    onClick={() => nav(`/project/${encodeURIComponent(p.id)}`)}>
                    <div className="card-top">
                      <span className="card-type-badge dosing">Dosing</span>
                      <span className="card-date">{formatDate(p.created_at)}</span>
                    </div>
                    <div className="card-name">{p.name}</div>
                    <div className="card-meta">{p.samples.length > 0 ? `${p.samples.length} source${p.samples.length !== 1 ? "s" : ""}` : "—"}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Merged */}
          <div ref={mergedRef} className="profile-section">
            <div className="profile-section-header">
              <span className="section-dot merged-dot" />
              <h2>Merged Projects</h2>
              <span className="section-count">{filteredMerged.length}</span>
              <button type="button" className="merge-trigger-btn" style={{ marginLeft: "auto" }} onClick={openMergeModal}>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                New merge
              </button>
            </div>
            {filteredMerged.length === 0 ? (
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
                {filteredMerged.map((p, i) => (
                  <div key={i} className="profile-project-card merged-card"
                    onClick={() => nav(`/merged-project/${encodeURIComponent((p as BackendMerged).id)}`)}>
                    <div className="card-top">
                      <span className="card-type-badge merged">Merged</span>
                      <span className="card-date">{formatDate((p as BackendMerged).created_at)}</span>
                      <div className="project-actions" style={{ marginLeft: "auto" }} onClick={e => e.stopPropagation()}>
                        <button type="button" className="icon-btn rename-btn" title="Rename" onClick={e => renameMerged(p, e)}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button type="button" className="icon-btn delete-btn" title="Delete" onClick={e => deleteMerged(p, e)}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6"/><path d="M14 11v6"/>
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className="card-name">{(p as BackendMerged).name}</div>
                    {p.mergedFrom && (
                      <div className="card-merged-from">
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
                          <path d="M18 9a9 9 0 0 1-9 9"/>
                        </svg>
                        {p.mergedFrom[0]} + {p.mergedFrom[1]}
                      </div>
                    )}
                  </div>
                ))}
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
                You need at least two projects to use this feature.
              </p>
            ) : (
              <>
                <div className="merge-selects-row">
                  <div className="merge-select-col">
                    <label htmlFor="mergeA">First project</label>
                    <select id="mergeA" className="modal-select" value={mergeA}
                      onChange={(e) => { setMergeA(e.target.value); setMergeError(""); }}>
                      <option value="">— Select project —</option>
                      {mergeableProjects.map((p) => (
                        <option key={p.id} value={p.id} disabled={p.id === mergeB}>
                          {p.projectName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="merge-plus-icon">+</div>
                  <div className="merge-select-col">
                    <label htmlFor="mergeB">Second project</label>
                    <select id="mergeB" className="modal-select" value={mergeB}
                      onChange={(e) => { setMergeB(e.target.value); setMergeError(""); }}>
                      <option value="">— Select project —</option>
                      {mergeableProjects.map((p) => (
                        <option key={p.id} value={p.id} disabled={p.id === mergeA}>
                          {p.projectName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <label htmlFor="mergeName">New merged project name</label>
                <input id="mergeName" type="text" placeholder="e.g. Combined Analysis Q1"
                  value={mergeName} onChange={(e) => { setMergeName(e.target.value); setMergeError(""); }} />
              </>
            )}
            {mergeError && <p className="form-error">{mergeError}</p>}
            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button type="button" onClick={doMerge} disabled={mergeableProjects.length < 2}>
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