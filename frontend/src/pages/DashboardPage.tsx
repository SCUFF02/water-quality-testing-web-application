import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import MultiSensorForm from "../components/MultiSensorForm";
import DosingSystemForm from "../components/DosingSystemForm";

type SavedProject = {
  userId: string;
  projectName: string;
  systemType: "multisensor" | "dosing";
  timestamp: string;
  formData: Record<string, unknown>;
  manualData: unknown[];
  collectedData: unknown[];
};

export default function DashboardPage() {
  const nav = useNavigate();

  const [multiOpen, setMultiOpen] = useState(false);
  const [dosingOpen, setDosingOpen] = useState(false);

  const [projects, setProjects] = useState<SavedProject[]>(() => {
    return JSON.parse(localStorage.getItem("savedProjects") || "[]");
  });

  const [history, setHistory] = useState([
    "Création du projet MultiSensor",
    "Modification du projet Dosing System",
    "Consultation des données du projet Analyse Eau",
  ]);

  const username = "user";

  useEffect(() => {
    const stored: SavedProject[] = JSON.parse(localStorage.getItem("savedProjects") || "[]");
    setProjects(stored);
  }, [multiOpen, dosingOpen]);

  function logout() {
    localStorage.removeItem("token");
    nav("/signin", { replace: true });
  }

  function deleteProject(projectName: string) {
    const updated = projects.filter((p) => p.projectName !== projectName);
    setProjects(updated);
    localStorage.setItem("savedProjects", JSON.stringify(updated));
    setHistory((prev) => [`Suppression du projet ${projectName}`, ...prev]);
  }

  function renameProject(oldName: string) {
    const newName = window.prompt("Entrer le nouveau nom du projet :", oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;
    const trimmedName = newName.trim();
    const updated = projects.map((p) =>
      p.projectName === oldName ? { ...p, projectName: trimmedName } : p
    );
    setProjects(updated);
    localStorage.setItem("savedProjects", JSON.stringify(updated));
    setHistory((prev) => [
      `Projet renommé de "${oldName}" à "${trimmedName}"`,
      ...prev,
    ]);
  }

  function openMultiSensor() {
    setMultiOpen(true);
    setHistory((prev) => ["Ouverture du système MultiSensor", ...prev]);
  }

  function openDosingSystem() {
    setDosingOpen(true);
    setHistory((prev) => ["Ouverture du système Dosing System", ...prev]);
  }

  // Last 4 projects (most recently created = end of array)
  const recentProjects = [...projects].reverse().slice(0, 4);

  return (
    <div className="dashboard-page">
      <header className="topbar">
        <div className="logo">
          <img src="/logocerte.png" alt="CERTE logo" />
          <strong>CERTE</strong>
        </div>
        <button className="logout-btn" type="button" onClick={logout}>
          Logout
        </button>
      </header>

      <main className="dashboard-layout">
        <aside className="user-panel">
          <div className="projects-card">

            {/* Clickable username — navigates to profile */}
            <button
              type="button"
              className="username-btn"
              onClick={() => nav("/profile")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              {username}
            </button>

            <h2>History</h2>
            <ul className="history-list">
              {history.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>

            <h2>Recent Projects</h2>

            {recentProjects.length === 0 ? (
              <p>Aucun projet disponible.</p>
            ) : (
              <>
                {recentProjects.map((project, index) => (
                  <div className="project-item" key={index}>
                    <span
                      className="project-name"
                      style={{ cursor: "pointer" }}
                      onClick={() =>
                        nav(`/project/${encodeURIComponent(project.projectName)}`)
                      }
                    >
                      {project.projectName}
                      <span className={`project-type-badge ${project.systemType}`}>
                        {project.systemType === "multisensor" ? "MultiSensor" : "Dosing"}
                      </span>
                    </span>
                    <div className="project-actions">
                      <button
                        type="button"
                        className="icon-btn rename-btn"
                        onClick={() => renameProject(project.projectName)}
                        title="Renommer"
                        aria-label={`Renommer ${project.projectName}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="icon-btn delete-btn"
                        onClick={() => deleteProject(project.projectName)}
                        title="Supprimer"
                        aria-label={`Supprimer ${project.projectName}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          <path d="M10 11v6"/>
                          <path d="M14 11v6"/>
                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}

                {projects.length > 4 && (
                  <button
                    type="button"
                    className="see-all-btn"
                    onClick={() => nav("/profile")}
                  >
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
              <button type="button" onClick={openMultiSensor}>
                MultiSensor System
              </button>
              <button type="button" onClick={openDosingSystem}>
                Dosing System
              </button>
            </div>
          </div>
        </section>
      </main>

      {multiOpen && (
        <MultiSensorForm
          onClose={() => setMultiOpen(false)}
          projects={projects.map((p) => p.projectName)}
        />
      )}
      {dosingOpen && (
        <DosingSystemForm
          onClose={() => setDosingOpen(false)}
          projects={projects.map((p) => p.projectName)}
        />
      )}
    </div>
  );
}
