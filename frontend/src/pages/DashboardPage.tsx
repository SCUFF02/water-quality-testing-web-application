import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import MultiSensorForm from "../components/MultiSensorForm";
import DosingSystemForm from "../components/DosingSystemForm";

type SavedProject = {
  userId: string;
  projectName: string;
  systemType: "multisensor" | "dosing" | "merged";
  timestamp: string;
  formData: Record<string, unknown>;
  manualData: unknown[];
  collectedData: unknown[];
  mergedFrom?: string[];
};

export default function DashboardPage() {
  const nav = useNavigate();
  const [multiOpen,  setMultiOpen]  = useState(false);
  const [dosingOpen, setDosingOpen] = useState(false);
  const [projects, setProjects]     = useState<SavedProject[]>(() => {
    const all = JSON.parse(localStorage.getItem("savedProjects") || "[]") as SavedProject[];
    return all.filter((p) => p.userId === ((() => {
      try { return JSON.parse(localStorage.getItem("currentUser") || "{}").username || ""; }
      catch { return ""; }
    })()));
  });
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
  const isResearcher     = role === "researcher" || role === "admin";

  useEffect(() => {
    const cu = (() => {
      try { return JSON.parse(localStorage.getItem("currentUser") || "{}").username || ""; }
      catch { return ""; }
    })();
    const stored = JSON.parse(localStorage.getItem("savedProjects") || "[]") as SavedProject[];
    setProjects(stored.filter((p) => p.userId === cu));
  }, [multiOpen, dosingOpen]);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("currentUser");
    nav("/signin", { replace: true });
  }

  function deleteProject(projectName: string) {
    const allGlobal: SavedProject[] = JSON.parse(localStorage.getItem("savedProjects") || "[]");
    const globalUpdated = allGlobal.filter((p) => p.projectName !== projectName);
    localStorage.setItem("savedProjects", JSON.stringify(globalUpdated));
    setProjects((prev) => prev.filter((p) => p.projectName !== projectName));
    setHistory((prev) => [`Suppression du projet ${projectName}`, ...prev]);
  }

  function renameProject(oldName: string) {
    const newName = window.prompt("Entrer le nouveau nom du projet :", oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;
    const trimmedName = newName.trim();
    const allGlobal: SavedProject[] = JSON.parse(localStorage.getItem("savedProjects") || "[]");
    const globalUpdated = allGlobal.map((p) =>
      p.projectName === oldName ? { ...p, projectName: trimmedName } : p
    );
    localStorage.setItem("savedProjects", JSON.stringify(globalUpdated));
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
              {isResearcher && (
                <span className="role-chip researcher-chip">Researcher</span>
              )}
            </button>

            <h2>History</h2>
            <ul className="history-list">
              {history.map((item, index) => <li key={index}>{item}</li>)}
            </ul>

            <h2>Recent Projects</h2>
            {recentProjects.length === 0 ? (
              <p>Aucun projet disponible.</p>
            ) : (
              <>
                {recentProjects.map((project, index) => (
                  <div className="project-item" key={index}>
                    <span className="project-name" style={{ cursor: "pointer" }}
                      onClick={() => nav(`/project/${encodeURIComponent(project.projectName)}`)}>
                      {project.projectName}
                      <span className={`project-type-badge ${project.systemType}`}>
                        {project.systemType === "multisensor" ? "MultiSensor" : "Dosing"}
                      </span>
                    </span>
                    <div className="project-actions">
                      <button type="button" className="icon-btn rename-btn"
                        onClick={() => renameProject(project.projectName)}
                        title="Renommer" aria-label={`Renommer ${project.projectName}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button type="button" className="icon-btn delete-btn"
                        onClick={() => deleteProject(project.projectName)}
                        title="Supprimer" aria-label={`Supprimer ${project.projectName}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          <div className="systems-section">
            <h2>Systems</h2>
            <div className="systems">
              <button type="button" onClick={openMultiSensor}>MultiSensor System</button>
              <button type="button" onClick={openDosingSystem}>Dosing System</button>
            </div>
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

      {multiOpen && (
        <MultiSensorForm onClose={() => setMultiOpen(false)} projects={projects.map((p) => p.projectName)} />
      )}
      {dosingOpen && (
        <DosingSystemForm onClose={() => setDosingOpen(false)} projects={projects.map((p) => p.projectName)} />
      )}
    </div>
  );
}