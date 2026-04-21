import { useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import MultiSensorForm from "../components/MultiSensorForm";
import DosingSystemForm from "../components/DosingSystemForm";

import { BASE_URL as API } from "../api/api";

type BackendProject = {
  id: string;
  name: string;
  system_type: "multisensor" | "dosing";
  created_at: string;
  manual_only: boolean;
  samples: { id: string; sample_name: string; region: string }[];
};

function token() { return localStorage.getItem("token") || ""; }

function formatDate(ts: string) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function DashboardPage() {
  const nav = useNavigate();

  const [multiOpen,  setMultiOpen]  = useState(false);
  const [dosingOpen, setDosingOpen] = useState(false);
  const [projects,   setProjects]   = useState<BackendProject[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [history, setHistory] = useState<string[]>([]);

  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem("currentUser") || "{}"); }
    catch { return {}; }
  })();
  const username: string = currentUser.username || "user";
  const role: string     = currentUser.role     || "user";
  const isResearcher     = role === "researcher";

  const loadProjects = useCallback(async () => {
    if (!token()) { setLoading(false); return; }
    setError("");
    try {
      const [ms, dos] = await Promise.all([
        fetch(`${API}/multisensor/projects`, { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/dosing/projects`,      { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.ok ? r.json() : []),
      ]);
      const all: BackendProject[] = [
        ...ms.map((p: BackendProject) => ({ ...p, system_type: "multisensor" as const })),
        ...dos.map((p: BackendProject) => ({ ...p, system_type: "dosing" as const })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setProjects(all);
    } catch { setError("Could not load projects — make sure the backend is running."); setProjects([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  // Reload after modal closes (new project was created)
  useEffect(() => {
    if (!multiOpen && !dosingOpen) loadProjects();
  }, [multiOpen, dosingOpen, loadProjects]);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("currentUser");
    nav("/signin", { replace: true });
  }

  async function deleteProject(project: BackendProject) {
    if (!window.confirm(`Delete "${project.name}"? This cannot be undone.`)) return;
    const endpoint = project.system_type === "multisensor"
      ? `/multisensor/projects/${project.id}`
      : `/dosing/projects/${project.id}`;
    try {
      await fetch(`${API}${endpoint}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token()}` },
      });
      setProjects(prev => prev.filter(p => p.id !== project.id));
      setHistory(prev => [`Deleted project "${project.name}"`, ...prev]);
    } catch {
      alert("Could not delete project — make sure the backend is running.");
    }
  }

  async function renameProject(project: BackendProject) {
    const newName = window.prompt("Enter new project name:", project.name);
    if (!newName || !newName.trim() || newName.trim() === project.name) return;
    const trimmed = newName.trim();
    const endpoint = project.system_type === "multisensor"
      ? `/multisensor/projects/${project.id}`
      : `/dosing/projects/${project.id}`;
    try {
      const res = await fetch(`${API}${endpoint}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.detail || "Could not rename project.");
        return;
      }
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, name: trimmed } : p));
      setHistory(prev => [`Renamed "${project.name}" to "${trimmed}"`, ...prev]);
    } catch {
      alert("Could not connect to server.");
    }
  }

  const recentProjects = projects.slice(0, 4);
  const multisensorCount = projects.filter(p => p.system_type === "multisensor").length;
  const dosingCount      = projects.filter(p => p.system_type === "dosing").length;
  const totalSamples     = projects.reduce((acc, p) => acc + p.samples.length, 0);

  return (
    <div className="dashboard-page">
      <header className="topbar">
        <div className="logo">
          <img src="/logocerte.png" alt="CERTE logo" />
          <strong>CERTE</strong>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {isResearcher && (
            <button type="button" className="researcher-nav-btn" onClick={() => nav("/browse")}>
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              Browse users
            </button>
          )}
          <button className="logout-btn" type="button" onClick={logout}>Logout</button>
        </div>
      </header>

      <main className="dashboard-layout">
        <aside className="user-panel">
          <div className="projects-card">
            <button type="button" className="username-btn" onClick={() => nav("/profile")}>
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              {username}
              {isResearcher && <span className="role-chip researcher-chip">Researcher</span>}
            </button>

            <h2>History</h2>
            <ul className="history-list">
              {history.length === 0
                ? <li style={{ color: "var(--ink-3)", fontSize: 12 }}>No actions yet.</li>
                : history.slice(0, 6).map((item, i) => <li key={i}>{item}</li>)
              }
            </ul>

            <h2>Recent Projects</h2>
            {loading ? (
              <p style={{ fontSize: 12, color: "var(--ink-3)", padding: "8px 0" }}>Loading…</p>
            ) : recentProjects.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--ink-3)", padding: "8px 0" }}>No projects yet.</p>
            ) : (
              <>
                {recentProjects.map((project) => (
                  <div className="project-item" key={project.id}>
                    <span className="project-name" style={{ cursor: "pointer" }}
                      onClick={() => nav(`/project/${encodeURIComponent(project.id)}`)}>
                      {project.name}
                      <span className={`project-type-badge ${project.system_type}`}>
                        {project.system_type === "multisensor" ? "MultiSensor" : "Dosing"}
                      </span>
                    </span>
                    <div className="project-actions">
                      <button type="button" className="icon-btn rename-btn"
                        onClick={() => renameProject(project)} title="Rename">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button type="button" className="icon-btn delete-btn"
                        onClick={() => deleteProject(project)} title="Delete">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          <path d="M10 11v6"/><path d="M14 11v6"/>
                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
                {projects.length > 4 && (
                  <button type="button" className="see-all-btn" onClick={() => nav("/profile")}>
                    +{projects.length - 4} more — see all
                  </button>
                )}
              </>
            )}
          </div>
        </aside>

        <section className="main-panel">
          {error && (
            <div style={{ background: "var(--danger-subtle)", border: "1px solid var(--danger)", borderRadius: 8, padding: "12px 16px", marginBottom: 16, color: "var(--danger)", fontSize: 13 }}>
              {error}
            </div>
          )}
          <div className="db-stats-row">
            <div className="db-stat-card">
              <div className="db-stat-icon db-stat-icon-blue">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              </div>
              <div><div className="db-stat-value">{projects.length}</div><div className="db-stat-label">Total projects</div></div>
            </div>
            <div className="db-stat-card">
              <div className="db-stat-icon db-stat-icon-blue">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
              </div>
              <div><div className="db-stat-value">{multisensorCount}</div><div className="db-stat-label">MultiSensor</div></div>
            </div>
            <div className="db-stat-card">
              <div className="db-stat-icon db-stat-icon-green">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M12 6v6l4 2"/></svg>
              </div>
              <div><div className="db-stat-value">{dosingCount}</div><div className="db-stat-label">Dosing</div></div>
            </div>
            <div className="db-stat-card">
              <div className="db-stat-icon db-stat-icon-blue">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/></svg>
              </div>
              <div><div className="db-stat-value">{totalSamples}</div><div className="db-stat-label">Total samples</div></div>
            </div>
          </div>

          <div className="systems-section">
            <div className="systems-section-header">
              <h2>Systems</h2>
              <span className="systems-section-sub">Start a new measurement project</span>
            </div>
            <div className="systems">
              <button type="button" onClick={() => setMultiOpen(true)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                MultiSensor System
              </button>
              <button type="button" onClick={() => setDosingOpen(true)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M12 8v4l3 3"/></svg>
                Dosing System
              </button>
            </div>
          </div>

          <div className="db-projects-table-card">
            <div className="db-table-header">
              <h2>All projects</h2>
              <button type="button" className="btn-ghost db-see-all" onClick={() => nav("/profile")}>View in profile →</button>
            </div>
            {loading ? (
              <p className="no-data" style={{ padding: "24px 0" }}>Loading projects…</p>
            ) : projects.length === 0 ? (
              <div className="db-empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--ink-3)", marginBottom: 10 }}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                <p>No projects yet.</p>
                <p style={{ fontSize: 12, color: "var(--ink-3)" }}>Use the Systems buttons above to create your first project.</p>
              </div>
            ) : (
              <table className="db-table">
                <thead>
                  <tr><th>Project</th><th>Type</th><th>Samples</th><th>Created</th><th></th></tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id} onClick={() => nav(`/project/${encodeURIComponent(p.id)}`)} style={{ cursor: "pointer" }}>
                      <td className="db-table-name">{p.name}</td>
                      <td><span className={`project-type-badge ${p.system_type}`}>{p.system_type === "multisensor" ? "MultiSensor" : "Dosing"}</span></td>
                      <td className="db-table-num">{p.samples.length || "—"}</td>
                      <td className="db-table-date">{formatDate(p.created_at)}</td>
                      <td>
                        <div className="db-table-actions" onClick={e => e.stopPropagation()}>
                          <button type="button" className="icon-btn rename-btn" onClick={() => renameProject(p)} title="Rename">
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>
                          <button type="button" className="icon-btn delete-btn" onClick={() => deleteProject(p)} title="Delete">
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                              <path d="M10 11v6"/><path d="M14 11v6"/>
                              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {isResearcher && (
            <div className="researcher-banner" onClick={() => nav("/browse")}>
              <div className="researcher-banner-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <div>
                <div className="researcher-banner-title">Browse other researchers</div>
                <div className="researcher-banner-sub">Search users and view their projects and samples</div>
              </div>
              <svg style={{ marginLeft: "auto", color: "var(--researcher)" }} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
              </svg>
            </div>
          )}
        </section>
      </main>

      {multiOpen  && <MultiSensorForm  onClose={() => setMultiOpen(false)}  projects={projects.map(p => p.name)} />}
      {dosingOpen && <DosingSystemForm onClose={() => setDosingOpen(false)} projects={projects.map(p => p.name)} />}
    </div>
  );
}