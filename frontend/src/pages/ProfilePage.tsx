import { api } from "../api/api";
import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { EditModal, ConfirmModal } from "../components/EditModal";

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

  // Merged projects
  const [mergedProjects, setMergedProjects] = useState<BackendMerged[]>([]);

  // Password change
  const [pwModalOpen, setPwModalOpen]   = useState(false);
  const [currentPw,   setCurrentPw]     = useState("");
  const [newPw,       setNewPw]         = useState("");
  const [pwError,     setPwError]       = useState("");
  const [pwSuccess,   setPwSuccess]     = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Rename/delete modals
  const [renameModal,  setRenameModal]  = useState<{ id: string; name: string; type: "project" | "merged"; systemType?: string } | null>(null);
  const [deleteModal,  setDeleteModal]  = useState<{ id: string; name: string; type: "project" | "merged"; systemType?: string } | null>(null);
  const [modalError,   setModalError]   = useState("");

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

  async function changePassword() {
    setPwError(""); setPwSuccess("");
    if (!currentPw) { setPwError("Enter your current password."); return; }
    if (newPw.length < 6) { setPwError("New password must be at least 6 characters."); return; }
    const res = await api.post("/users/me/change-password", { current_password: currentPw, new_password: newPw });
    const d = await res.json();
    if (!res.ok) { setPwError(d.detail || "Could not change password."); return; }
    setPwSuccess("Password changed successfully.");
    setCurrentPw(""); setNewPw("");
    setTimeout(() => { setPwModalOpen(false); setPwSuccess(""); }, 1500);
  }

  async function renameProject(p: BackendProject, e: React.MouseEvent) {
    e.stopPropagation();
    setModalError("");
    setRenameModal({ id: p.id, name: p.name, type: "project", systemType: p.system_type });
  }

  async function deleteProject(p: BackendProject, e: React.MouseEvent) {
    e.stopPropagation();
    setDeleteModal({ id: p.id, name: p.name, type: "project", systemType: p.system_type });
  }

  async function doRenameProject(id: string, _name: string, systemType: string, newName: string) {
    const endpoint = systemType === "multisensor" ? `/multisensor/projects/${id}` : `/dosing/projects/${id}`;
    const res = await api.patch(endpoint, { name: newName });
    if (!res.ok) { const d = await res.json(); setModalError(d.detail || "Could not rename."); return; }
    if (systemType === "multisensor") setBackendMultisensor(prev => prev.map(x => x.id === id ? { ...x, name: newName } : x));
    else setBackendDosing(prev => prev.map(x => x.id === id ? { ...x, name: newName } : x));
    setRenameModal(null);
  }

  async function doDeleteProject(id: string, _name: string, systemType: string) {
    const endpoint = systemType === "multisensor" ? `/multisensor/projects/${id}` : `/dosing/projects/${id}`;
    const res = await api.del(endpoint);
    if (!res.ok) { setModalError("Could not delete project."); return; }
    if (systemType === "multisensor") setBackendMultisensor(prev => prev.filter(x => x.id !== id));
    else setBackendDosing(prev => prev.filter(x => x.id !== id));
    setDeleteModal(null);
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
    setModalError("");
    setRenameModal({ id: p.id, name: p.name, type: "merged" });
  }

  async function deleteMerged(p: BackendMerged, e: React.MouseEvent) {
    e.stopPropagation();
    setDeleteModal({ id: p.id, name: p.name, type: "merged" });
  }

  async function doRenameMerged(id: string, newName: string) {
    const res = await api.patch(`/merged/projects/${id}`, { name: newName });
    if (!res.ok) { const d = await res.json(); setModalError(d.detail || "Could not rename."); return; }
    setMergedProjects(prev => prev.map(m => m.id === id ? { ...m, name: newName } : m));
    setRenameModal(null);
  }

  async function doDeleteMerged(id: string) {
    const res = await api.del(`/merged/projects/${id}`);
    if (!res.ok) { setModalError("Could not delete."); return; }
    setMergedProjects(prev => prev.filter(m => m.id !== id));
    setDeleteModal(null);
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
          <div className="user-menu-wrap">
            <button className="user-menu-btn" type="button" onClick={() => setUserMenuOpen(v => !v)}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
            {userMenuOpen && (
              <div className="user-menu-dropdown" style={{ display: "block" }}>
                <button type="button" onClick={() => { setUserMenuOpen(false); setPwModalOpen(true); setPwError(""); setPwSuccess(""); setCurrentPw(""); setNewPw(""); }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  Change password
                </button>
                <button type="button" className="user-menu-danger" onClick={logout}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  Logout
                </button>
              </div>
            )}
          </div>
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
                      <div className="project-actions" style={{ marginLeft: "auto" }} onClick={e => e.stopPropagation()}>
                        <button type="button" className="icon-btn rename-btn" title="Rename" onClick={e => renameProject(p, e)}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button type="button" className="icon-btn delete-btn" title="Delete" onClick={e => deleteProject(p, e)}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6"/><path d="M14 11v6"/>
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className="card-name">{p.name}</div>
                    <div className="card-bottom">
                      <span className="card-meta">{p.samples.length > 0 ? `${p.samples.length} sample${p.samples.length !== 1 ? "s" : ""}` : "—"}</span>
                      <span className="card-date">{formatDate(p.created_at)}</span>
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
                      <div className="project-actions" style={{ marginLeft: "auto" }} onClick={e => e.stopPropagation()}>
                        <button type="button" className="icon-btn rename-btn" title="Rename" onClick={e => renameProject(p, e)}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button type="button" className="icon-btn delete-btn" title="Delete" onClick={e => deleteProject(p, e)}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6"/><path d="M14 11v6"/>
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className="card-name">{p.name}</div>
                    <div className="card-bottom">
                      <span className="card-meta">{p.samples.length > 0 ? `${p.samples.length} source${p.samples.length !== 1 ? "s" : ""}` : "—"}</span>
                      <span className="card-date">{formatDate(p.created_at)}</span>
                    </div>
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
                    <div className="card-bottom">
                      <span />
                      <span className="card-date">{formatDate((p as BackendMerged).created_at)}</span>
                    </div>
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

      {/* PASSWORD CHANGE MODAL */}
      {pwModalOpen && (
        <div className="modal-overlay" onClick={() => setPwModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Change password</h3>
            <label htmlFor="current-pw">Current password</label>
            <input id="current-pw" type="password" value={currentPw} autoFocus
              onChange={e => { setCurrentPw(e.target.value); setPwError(""); }} />
            <label htmlFor="new-pw">New password</label>
            <input id="new-pw" type="password" value={newPw} placeholder="Min. 6 characters"
              onChange={e => { setNewPw(e.target.value); setPwError(""); }} />
            {pwError   && <p className="form-error">{pwError}</p>}
            {pwSuccess && <p style={{ color: "var(--green)", fontSize: 13, textAlign: "center" }}>{pwSuccess}</p>}
            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button type="button" onClick={changePassword}>Save</button>
              <button type="button" onClick={() => setPwModalOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {renameModal && (
        <EditModal
          title={`Rename "${renameModal.name}"`}
          fields={[{ id: "name", label: "New name", defaultValue: renameModal.name, maxLength: 120 }]}
          error={modalError}
          onClose={() => { setRenameModal(null); setModalError(""); }}
          onSave={v => renameModal.type === "project"
            ? doRenameProject(renameModal.id, renameModal.name, renameModal.systemType!, v.name.trim())
            : doRenameMerged(renameModal.id, v.name.trim())}
        />
      )}

      {deleteModal && (
        <ConfirmModal
          title="Delete project"
          message={<>Delete <strong>{deleteModal.name}</strong>? This cannot be undone.</>}
          confirmLabel="Yes, delete"
          danger
          onClose={() => { setDeleteModal(null); setModalError(""); }}
          onConfirm={() => deleteModal.type === "project"
            ? doDeleteProject(deleteModal.id, deleteModal.name, deleteModal.systemType!)
            : doDeleteMerged(deleteModal.id)}
        />
      )}
    </div>
  );
}