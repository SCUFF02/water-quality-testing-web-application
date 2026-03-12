import { useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";

type FormData = {
  samples?:    { sampleName: string; region: string }[];
  sources?:    string[];
  liquid?:     string;
  liquids?:    string[];
  parameters?: { name: string; target: string; unit: string }[];
  manualOnly?: boolean;
};

type SavedProject = {
  userId:       string;
  projectName:  string;
  systemType:   "multisensor" | "dosing";
  timestamp:    string;
  formData:     FormData;
  manualData:   unknown[];
  collectedData: unknown[];
};

export default function ProfilePage() {
  const nav = useNavigate();
  const [search, setSearch] = useState("");

  const multisensorRef = useRef<HTMLDivElement>(null);
  const dosingRef      = useRef<HTMLDivElement>(null);

  const projects: SavedProject[] = JSON.parse(localStorage.getItem("savedProjects") || "[]");
  const username = "user";

  const filtered = useMemo(() => {
    if (!search.trim()) return projects;
    const q = search.trim().toLowerCase();
    return projects.filter((p) => p.projectName.toLowerCase().includes(q));
  }, [search, projects]);

  const multisensorProjects = filtered.filter((p) => p.systemType === "multisensor");
  const dosingProjects      = filtered.filter((p) => p.systemType === "dosing");

  function scrollTo(ref: React.RefObject<HTMLDivElement | null>) {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function logout() {
    localStorage.removeItem("token");
    nav("/signin", { replace: true });
  }

  function formatDate(ts: string) {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <div className="profile-page">

      {/* ── TOPBAR ── */}
      <header className="topbar">
        <div className="logo">
          <img src="/logocerte.png" alt="CERTE logo" />
          <strong>CERTE</strong>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button type="button" className="back-btn" onClick={() => nav("/app")}>
            ← Dashboard
          </button>
          <button className="logout-btn" type="button" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      <div className="profile-layout">

        {/* ── SIDE NAV ── */}
        <aside className="profile-sidenav">
          <div className="profile-avatar">
            <div className="avatar-circle">
              {username.charAt(0).toUpperCase()}
            </div>
            <div className="avatar-name">{username}</div>
            <div className="avatar-sub">
              {projects.length} project{projects.length !== 1 ? "s" : ""}
            </div>
          </div>

          <nav className="sidenav-links">
            <p className="sidenav-label">Jump to</p>
            <button
              type="button"
              className="sidenav-link"
              onClick={() => scrollTo(multisensorRef)}
            >
              <span className="sidenav-dot multisensor-dot" />
              MultiSensor
              <span className="sidenav-count">
                {projects.filter((p) => p.systemType === "multisensor").length}
              </span>
            </button>
            <button
              type="button"
              className="sidenav-link"
              onClick={() => scrollTo(dosingRef)}
            >
              <span className="sidenav-dot dosing-dot" />
              Dosing
              <span className="sidenav-count">
                {projects.filter((p) => p.systemType === "dosing").length}
              </span>
            </button>
          </nav>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <main className="profile-main">

          {/* Search bar */}
          <div className="profile-search-wrap">
            <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              className="profile-search"
              type="text"
              placeholder="Search projects…"
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

          {/* ── MultiSensor section ── */}
          <div ref={multisensorRef} className="profile-section">
            <div className="profile-section-header">
              <span className="section-dot multisensor-dot" />
              <h2>MultiSensor Projects</h2>
              <span className="section-count">{multisensorProjects.length}</span>
            </div>

            {multisensorProjects.length === 0 ? (
              <p className="no-data">
                No MultiSensor projects{search ? " matching your search" : ""}.
              </p>
            ) : (
              <div className="profile-projects-grid">
                {multisensorProjects.map((p, i) => {
                  const sampleCount = p.formData.samples?.length ?? 0;
                  return (
                    <div
                      key={i}
                      className="profile-project-card multisensor-card"
                      onClick={() => nav(`/project/${encodeURIComponent(p.projectName)}`)}
                    >
                      <div className="card-top">
                        <span className="card-type-badge multisensor">MultiSensor</span>
                        <span className="card-date">{formatDate(p.timestamp)}</span>
                      </div>
                      <div className="card-name">{p.projectName}</div>
                      <div className="card-meta">
                        {sampleCount > 0
                          ? `${sampleCount} sample${sampleCount !== 1 ? "s" : ""}`
                          : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Dosing section ── */}
          <div ref={dosingRef} className="profile-section">
            <div className="profile-section-header">
              <span className="section-dot dosing-dot" />
              <h2>Dosing Projects</h2>
              <span className="section-count">{dosingProjects.length}</span>
            </div>

            {dosingProjects.length === 0 ? (
              <p className="no-data">
                No Dosing projects{search ? " matching your search" : ""}.
              </p>
            ) : (
              <div className="profile-projects-grid">
                {dosingProjects.map((p, i) => {
                  const activeSources = p.formData.sources?.filter((s) => s.trim()).length ?? 0;
                  const liquid = p.formData.liquid ?? "";
                  return (
                    <div
                      key={i}
                      className="profile-project-card dosing-card"
                      onClick={() => nav(`/project/${encodeURIComponent(p.projectName)}`)}
                    >
                      <div className="card-top">
                        <span className="card-type-badge dosing">Dosing</span>
                        <span className="card-date">{formatDate(p.timestamp)}</span>
                      </div>
                      <div className="card-name">{p.projectName}</div>
                      <div className="card-meta">
                        {activeSources > 0
                          ? `${activeSources} source${activeSources !== 1 ? "s" : ""}`
                          : "—"}
                        {liquid ? ` · ${liquid}` : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </main>
      </div>
    </div>
  );
}
