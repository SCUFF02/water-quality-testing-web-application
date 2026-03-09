import { useNavigate } from "react-router-dom";
import { useState } from "react";
import MultiSensorForm from "../components/MultiSensorForm";
import DosingSystemForm from "../components/DosingSystemForm";

export default function DashboardPage() {
  const nav = useNavigate();

  const [multiOpen, setMultiOpen] = useState(false);
  const [dosingOpen, setDosingOpen] = useState(false);

  const [projects, setProjects] = useState([
    "Projet MultiSensor",
    "Projet Dosing System",
    "Projet Analyse Eau",
  ]);

  const [history, setHistory] = useState([
    "Création du projet MultiSensor",
    "Modification du projet Dosing System",
    "Consultation des données du projet Analyse Eau",
  ]);

  const username = "user";

  function logout() {
    localStorage.removeItem("token");
    nav("/signin", { replace: true });
  }

  function deleteProject(projectName: string) {
    setProjects((prevProjects) =>
      prevProjects.filter((project) => project !== projectName)
    );
    setHistory((prevHistory) => [
      `Suppression du projet ${projectName}`,
      ...prevHistory,
    ]);
  }

  function renameProject(oldName: string) {
    const newName = window.prompt("Entrer le nouveau nom du projet :", oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;

    const trimmedName = newName.trim();

    setProjects((prevProjects) =>
      prevProjects.map((project) =>
        project === oldName ? trimmedName : project
      )
    );
    setHistory((prevHistory) => [
      `Projet renommé de "${oldName}" à "${trimmedName}"`,
      ...prevHistory,
    ]);
  }

  function openMultiSensor() {
    setMultiOpen(true);
    setHistory((prevHistory) => [
      "Ouverture du système MultiSensor",
      ...prevHistory,
    ]);
  }

  function openDosingSystem() {
    setDosingOpen(true);
    setHistory((prevHistory) => [
      "Ouverture du système Dosing System",
      ...prevHistory,
    ]);
  }

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
            <h2>{username}</h2>

            <h2>Historic</h2>
            <ul className="history-list">
              {history.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>

            <h2>Projects</h2>

            {projects.length === 0 ? (
              <p>Aucun projet disponible.</p>
            ) : (
              projects.map((project, index) => (
                <div className="project-item" key={index}>
                  <span className="project-name">{project}</span>
                  <div className="project-actions">
                    <button
                      type="button"
                      className="icon-btn rename-btn"
                      onClick={() => renameProject(project)}
                      title="Renommer"
                      aria-label={`Renommer ${project}`}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      className="icon-btn delete-btn"
                      onClick={() => deleteProject(project)}
                      title="Supprimer"
                      aria-label={`Supprimer ${project}`}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))
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
         projects={projects}
         />
        )}
        {dosingOpen && (
         <DosingSystemForm
          onClose={() => setDosingOpen(false)}
         projects={projects}
         />
        )}
    </div>
  );
}