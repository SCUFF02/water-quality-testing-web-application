import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

type SampleEntry = { sampleName: string; region: string };

type SavedProject = {
  userId:        string;
  projectName:   string;
  systemType:    "multisensor" | "dosing" | "merged";
  timestamp:     string;
  formData:      {
    samples?:  SampleEntry[];
    sources?:  string[];
    liquid?:   string;
    liquids?:  string[];
    manualOnly?: boolean;
  };
  manualData:    unknown[];
  collectedData: unknown[];
  mergedFrom?:   string[];
};

export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const nav = useNavigate();
  const [search, setSearch] = useState("");

  const decoded = decodeURIComponent(username || "");

  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem("currentUser") || "{}"); }
    catch { return {}; }
  })();
  const role: string = currentUser.role || "researcher";
  const backPath = role === "admin" ? "/admin" : "/browse";
  const backLabel = role === "admin" ? "← Admin" : "← Browse";

  const allProjects: SavedProject[] = JSON.parse(localStorage.getItem("savedProjects") || "[]");
  const theirProjects = allProjects.filter((p) => p.userId === decoded);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return theirProjects;
    return theirProjects.filter((p) => {
      if (p.projectName.toLowerCase().includes(q)) return true;
      if (p.formData.samples?.some(
        (s) => s.sampleName.toLowerCase().includes(q) || s.region.toLowerCase().includes(q)
      )) return true;
      if (p.formData.sources?.some((s) => s.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [search, theirProjects]);

  const multisensorProjects = filtered.filter((p) => p.systemType === "multisensor");
  const dosingProjects      = filtered.filter((p) => p.systemType === "dosing");
  const mergedProjects      = filtered.filter((p) => p.systemType === "merged");

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("currentUser");
    nav("/signin", { replace: true });
  }

  function formatDate(ts: string) {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  // Aggregate all unique regions across this user's projects
  const allRegions = useMemo(() => {
    const s = new Set<string>();
    theirProjects.forEach((p) => p.formData.samples?.forEach((sm) => { if (sm.region) s.add(sm.region); }));
    return Array.from(s);
  }, [theirProjects]);

  return (
    <div className="profile-page">
      <header className="topbar">
        <div className="logo">
          <img src="/logocerte.png" alt="CERTE logo" />
          <strong>CERTE</strong>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button type="button" className="back-btn" onClick={() => nav(backPath)}>{backLabel}</button>
          <button className="logout-btn" type="button" onClick={logout}>Logout</button>
        </div>
      </header>

      <div className="profile-layout">

        {/* SIDENAV — read-only summary */}
        <aside className="profile-sidenav">
          <div className="profile-avatar">
            <div className="avatar-circle">{decoded.charAt(0).toUpperCase()}</div>
            <div className="avatar-name">{decoded}</div>
            <div className="avatar-sub">
              {theirProjects.length} project{theirProjects.length !== 1 ? "s" : ""}
            </div>
          </div>

          {allRegions.length > 0 && (
            <div className="public-regions-panel">
              <p className="sidenav-label">Regions covered</p>
              <div className="public-regions-list">
                {allRegions.map((r, i) => (
                  <span key={i} className="ruc-region-tag">{r}</span>
                ))}
              </div>
            </div>
          )}

          <div className="public-stats-panel">
            <p className="sidenav-label">Summary</p>
            <div className="public-stat-row">
              <span>MultiSensor</span>
              <span className="public-stat-val">{theirProjects.filter((p) => p.systemType === "multisensor").length}</span>
            </div>
            <div className="public-stat-row">
              <span>Dosing</span>
              <span className="public-stat-val">{theirProjects.filter((p) => p.systemType === "dosing").length}</span>
            </div>
            <div className="public-stat-row">
              <span>Merged</span>
              <span className="public-stat-val">{theirProjects.filter((p) => p.systemType === "merged").length}</span>
            </div>
          </div>

          <div className="readonly-notice">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            View-only profile
          </div>
        </aside>

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

          {theirProjects.length === 0 && (
            <p className="no-data" style={{ marginTop: 24 }}>This user has no projects yet.</p>
          )}

          {filtered.length === 0 && search && (
            <p className="no-data" style={{ marginTop: 24 }}>No projects match "{search}".</p>
          )}

          {/* MultiSensor */}
          {multisensorProjects.length > 0 && (
            <div className="profile-section">
              <div className="profile-section-header">
                <span className="section-dot multisensor-dot" />
                <h2>MultiSensor Projects</h2>
                <span className="section-count">{multisensorProjects.length}</span>
              </div>
              <div className="profile-projects-grid">
                {multisensorProjects.map((p, i) => {
                  const sampleCount = p.formData.samples?.length ?? 0;
                  return (
                    <div key={i} className="profile-project-card multisensor-card public-card">
                      <div className="card-top">
                        <span className="card-type-badge multisensor">MultiSensor</span>
                        <span className="card-date">{formatDate(p.timestamp)}</span>
                      </div>
                      <div className="card-name">{p.projectName}</div>
                      {p.formData.samples && p.formData.samples.length > 0 && (
                        <div className="card-samples-preview">
                          {p.formData.samples.slice(0, 3).map((s, si) => (
                            <span key={si} className="card-sample-tag">
                              {s.sampleName}{s.region ? ` · ${s.region}` : ""}
                            </span>
                          ))}
                          {p.formData.samples.length > 3 && (
                            <span className="card-sample-tag card-sample-more">
                              +{p.formData.samples.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                      <div className="card-meta">
                        {sampleCount > 0 ? `${sampleCount} sample${sampleCount !== 1 ? "s" : ""}` : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dosing */}
          {dosingProjects.length > 0 && (
            <div className="profile-section">
              <div className="profile-section-header">
                <span className="section-dot dosing-dot" />
                <h2>Dosing Projects</h2>
                <span className="section-count">{dosingProjects.length}</span>
              </div>
              <div className="profile-projects-grid">
                {dosingProjects.map((p, i) => {
                  const activeSources = p.formData.sources?.filter((s) => s.trim()).length ?? 0;
                  return (
                    <div key={i} className="profile-project-card dosing-card public-card">
                      <div className="card-top">
                        <span className="card-type-badge dosing">Dosing</span>
                        <span className="card-date">{formatDate(p.timestamp)}</span>
                      </div>
                      <div className="card-name">{p.projectName}</div>
                      <div className="card-meta">
                        {activeSources > 0 ? `${activeSources} source${activeSources !== 1 ? "s" : ""}` : "—"}
                        {p.formData.liquid ? ` · ${p.formData.liquid}` : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Merged */}
          {mergedProjects.length > 0 && (
            <div className="profile-section">
              <div className="profile-section-header">
                <span className="section-dot merged-dot" />
                <h2>Merged Projects</h2>
                <span className="section-count">{mergedProjects.length}</span>
              </div>
              <div className="profile-projects-grid">
                {mergedProjects.map((p, i) => (
                  <div key={i} className="profile-project-card merged-card public-card">
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
                  </div>
                ))}
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
