import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import MultiSensorForm from "../components/MultiSensorForm";
import DosingSystemForm from "../components/DosingSystemForm";

type SavedProject = {
  userId:       string;
  projectName:  string;
  systemType:   "multisensor" | "dosing" | "merged";
  timestamp:    string;
  formData:     Record<string, unknown>;
  manualData:   unknown[];
  collectedData: unknown[];
  mergedFrom?:  string[];
};

function getCurrentUsername(): string {
  try { return JSON.parse(localStorage.getItem("currentUser") || "{}").username || ""; }
  catch { return ""; }
}

function loadMyProjects(username: string): SavedProject[] {
  const all = JSON.parse(localStorage.getItem("savedProjects") || "[]") as SavedProject[];
  return all.filter((p) => p.userId === username);
}

function formatDate(ts: string) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function DashboardPage() {
  const nav = useNavigate();

  const [multiOpen,  setMultiOpen]  = useState(false);
  const [dosingOpen, setDosingOpen] = useState(false);
  const [projects,   setProjects]   = useState<SavedProject[]>(() =>
    loadMyProjects(getCurrentUsername())
  );
  const [history, setHistory] = useState([
    "Création du projet MultiSensor",
    "Modification du projet Dosing System",
    "Consultation des données du projet Analyse Eau",
  ]);

  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem("currentUser") || "{}"); }
    catch { return {}; }
  })();
  const username: string = currentUser.username || "user";
  const role: string     = currentUser.role     || "user";
  const isResearcher     = role === "researcher";

  useEffect(() => {
    setProjects(loadMyProjects(getCurrentUsername()));
  }, [multiOpen, dosingOpen]);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("currentUser");
    nav("/signin", { replace: true });
  }

  function deleteProject(projectName: string) {
    const allGlobal = JSON.parse(localStorage.getItem("savedProjects") || "[]") as SavedProject[];
    localStorage.setItem("savedProjects", JSON.stringify(
      allGlobal.filter((p) => p.projectName !== projectName)
    ));
    setProjects((prev) => prev.filter((p) => p.projectName !== projectName));
    setHistory((prev) => [`Suppression du projet ${projectName}`, ...prev]);
  }

  function renameProject(oldName: string) {
    const newName = window.prompt("Entrer le nouveau nom du projet :", oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;
    const trimmedName = newName.trim();
    const allGlobal = JSON.parse(localStorage.getItem("savedProjects") || "[]") as SavedProject[];
    localStorage.setItem("savedProjects", JSON.stringify(
      allGlobal.map((p) => p.projectName === oldName ? { ...p, projectName: trimmedName } : p)
    ));
    setProjects((prev) => prev.map((p) =>
      p.projectName === oldName ? { ...p, projectName: trimmedName } : p
    ));
    setHistory((prev) => [`Projet renommé de "${oldName}" à "${trimmedName}"`, ...prev]);
  }

  function openMultiSensor() {
    setMultiOpen(true);
    setHistory((prev) => ["Ouverture du système MultiSensor", ...prev]);
  }

  function openDosingSystem() {
    setDosingOpen(true);
    setHistory((prev) => ["Ouverture du système Dosing System", ...prev]);
  }

  const recentProjects = [...projects].reverse().slice(0, 4);

  // Stats
  const totalSamples = projects.reduce((acc, p) => {
    const samples = p.formData.samples as unknown[] | undefined;
    return acc + (Array.isArray(samples) ? samples.length : 0);
  }, 0);
  const totalDataPoints = projects.reduce((acc, p) => acc + (p.manualData?.length || 0) + (p.collectedData?.length || 0), 0);
  const multisensorCount = projects.filter((p) => p.systemType === "multisensor").length;
  const dosingCount      = projects.filter((p) => p.systemType === "dosing").length;

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

        {/* ── SIDEBAR ── */}
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
              {history.slice(0, 6).map((item, index) => <li key={index}>{item}</li>)}
            </ul>

            <h2>Recent Projects</h2>
            {recentProjects.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--ink-3)", padding: "8px 0" }}>No projects yet. Create one above.</p>
            ) : (
              <>
                {recentProjects.map((project, index) => (
                  <div className="project-item" key={index}>
                    <span className="project-name" style={{ cursor: "pointer" }}
                      onClick={() => nav(`/project/${encodeURIComponent(project.projectName)}`)}>
                      {project.projectName}
                      <span className={`project-type-badge ${project.systemType}`}>
                        {project.systemType === "multisensor" ? "MultiSensor"
                          : project.systemType === "dosing" ? "Dosing" : "Merged"}
                      </span>
                    </span>
                    <div className="project-actions">
                      <button type="button" className="icon-btn rename-btn"
                        onClick={() => renameProject(project.projectName)} title="Rename">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button type="button" className="icon-btn delete-btn"
                        onClick={() => deleteProject(project.projectName)} title="Delete">
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

        {/* ── MAIN PANEL ── */}
        <section className="main-panel">

          {/* Stats row */}
          <div className="db-stats-row">
            <div className="db-stat-card">
              <div className="db-stat-icon db-stat-icon-blue">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <div>
                <div className="db-stat-value">{projects.length}</div>
                <div className="db-stat-label">Total projects</div>
              </div>
            </div>
            <div className="db-stat-card">
              <div className="db-stat-icon db-stat-icon-blue">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                </svg>
              </div>
              <div>
                <div className="db-stat-value">{multisensorCount}</div>
                <div className="db-stat-label">MultiSensor</div>
              </div>
            </div>
            <div className="db-stat-card">
              <div className="db-stat-icon db-stat-icon-green">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
                  <path d="M12 6v6l4 2"/>
                </svg>
              </div>
              <div>
                <div className="db-stat-value">{dosingCount}</div>
                <div className="db-stat-label">Dosing</div>
              </div>
            </div>
            <div className="db-stat-card">
              <div className="db-stat-icon db-stat-icon-blue">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/>
                  <line x1="12" y1="18" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="7.05" y2="7.05"/>
                  <line x1="16.95" y1="16.95" x2="19.78" y2="19.78"/>
                </svg>
              </div>
              <div>
                <div className="db-stat-value">{totalSamples}</div>
                <div className="db-stat-label">Total samples</div>
              </div>
            </div>
            <div className="db-stat-card">
              <div className="db-stat-icon db-stat-icon-green">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
                  <line x1="6" y1="20" x2="6" y2="14"/>
                </svg>
              </div>
              <div>
                <div className="db-stat-value">{totalDataPoints}</div>
                <div className="db-stat-label">Data points</div>
              </div>
            </div>
          </div>

          {/* Systems */}
          <div className="systems-section">
            <div className="systems-section-header">
              <h2>Systems</h2>
              <span className="systems-section-sub">Start a new measurement project</span>
            </div>
            <div className="systems">
              <button type="button" onClick={openMultiSensor}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                </svg>
                MultiSensor System
              </button>
              <button type="button" onClick={openDosingSystem}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
                  <path d="M12 8v4l3 3"/>
                </svg>
                Dosing System
              </button>
            </div>
          </div>

          {/* All projects table */}
          <div className="db-projects-table-card">
            <div className="db-table-header">
              <h2>All projects</h2>
              <button type="button" className="btn-ghost db-see-all" onClick={() => nav("/profile")}>
                View in profile →
              </button>
            </div>

            {projects.length === 0 ? (
              <div className="db-empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--ink-3)", marginBottom: 10 }}>
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <p>No projects yet.</p>
                <p style={{ fontSize: 12, color: "var(--ink-3)" }}>Use the Systems buttons above to create your first project.</p>
              </div>
            ) : (
              <table className="db-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Type</th>
                    <th>Samples</th>
                    <th>Data points</th>
                    <th>Created</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {[...projects].reverse().map((p, i) => {
                    const samples = Array.isArray(p.formData.samples) ? (p.formData.samples as unknown[]).length : 0;
                    const dataPoints = (p.manualData?.length || 0) + (p.collectedData?.length || 0);
                    return (
                      <tr key={i} onClick={() => nav(`/project/${encodeURIComponent(p.projectName)}`)}
                        style={{ cursor: "pointer" }}>
                        <td className="db-table-name">{p.projectName}</td>
                        <td>
                          <span className={`project-type-badge ${p.systemType}`}>
                            {p.systemType === "multisensor" ? "MultiSensor"
                              : p.systemType === "dosing" ? "Dosing" : "Merged"}
                          </span>
                        </td>
                        <td className="db-table-num">{samples || "—"}</td>
                        <td className="db-table-num">{dataPoints || "—"}</td>
                        <td className="db-table-date">{formatDate(p.timestamp)}</td>
                        <td>
                          <div className="db-table-actions" onClick={(e) => e.stopPropagation()}>
                            <button type="button" className="icon-btn rename-btn"
                              onClick={() => renameProject(p.projectName)} title="Rename">
                              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                              </svg>
                            </button>
                            <button type="button" className="icon-btn delete-btn"
                              onClick={() => deleteProject(p.projectName)} title="Delete">
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
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Researcher banner */}
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

      {multiOpen && (
        <MultiSensorForm onClose={() => setMultiOpen(false)} projects={projects.map((p) => p.projectName)} />
      )}
      {dosingOpen && (
        <DosingSystemForm onClose={() => setDosingOpen(false)} projects={projects.map((p) => p.projectName)} />
      )}
    </div>
  );
}