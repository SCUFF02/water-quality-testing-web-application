import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";

type RegisteredUser = {
  username: string;
  email: string;
  role: "user" | "researcher" | "admin";
};

type SavedProject = {
  userId: string;
  projectName: string;
  systemType: "multisensor" | "dosing" | "merged";
  timestamp: string;
  formData: {
    samples?: { sampleName: string; region: string }[];
    sources?: string[];
  };
};

export default function ResearcherPage() {
  const nav = useNavigate();
  const [search, setSearch] = useState("");

  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem("currentUser") || "{}"); }
    catch { return {}; }
  })();

  const allUsers: RegisteredUser[] = JSON.parse(localStorage.getItem("registeredUsers") || "[]");
  const allProjects: SavedProject[] = JSON.parse(localStorage.getItem("savedProjects") || "[]");

  // Exclude self and admins from browseable list
  const browseableUsers = allUsers.filter(
    (u) => u.username !== currentUser.username && u.role !== "admin"
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return browseableUsers;
    return browseableUsers.filter((u) => {
      if (u.username.toLowerCase().includes(q)) return true;
      // also match by project name, sample name, or region within their projects
      const theirProjects = allProjects.filter((p) => p.userId === u.username);
      return theirProjects.some((p) => {
        if (p.projectName.toLowerCase().includes(q)) return true;
        if (p.formData.samples?.some(
          (s) => s.sampleName.toLowerCase().includes(q) || s.region.toLowerCase().includes(q)
        )) return true;
        if (p.formData.sources?.some((s) => s.toLowerCase().includes(q))) return true;
        return false;
      });
    });
  }, [search, browseableUsers, allProjects]);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("currentUser");
    nav("/signin", { replace: true });
  }

  function getProjectCounts(username: string) {
    const p = allProjects.filter((proj) => proj.userId === username);
    return {
      total: p.length,
      multisensor: p.filter((x) => x.systemType === "multisensor").length,
      dosing:      p.filter((x) => x.systemType === "dosing").length,
      merged:      p.filter((x) => x.systemType === "merged").length,
    };
  }

  // Get all unique regions from a user's projects
  function getRegions(username: string): string[] {
    const regions = new Set<string>();
    allProjects
      .filter((p) => p.userId === username)
      .forEach((p) => p.formData.samples?.forEach((s) => { if (s.region) regions.add(s.region); }));
    return Array.from(regions).slice(0, 3);
  }

  return (
    <div className="researcher-page">
      <header className="topbar">
        <div className="logo">
          <img src="/logocerte.png" alt="CERTE logo" />
          <strong>CERTE</strong>
          <span className="role-chip researcher-chip">Researcher</span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button type="button" className="back-btn" onClick={() => nav("/app")}>← Dashboard</button>
          <button className="logout-btn" type="button" onClick={logout}>Logout</button>
        </div>
      </header>

      <div className="researcher-layout">
        <div className="researcher-hero">
          <h1 className="researcher-hero-title">Browse researchers</h1>
          <p className="researcher-hero-sub">
            Search by username, project name, sample name, or region
          </p>
          <div className="researcher-search-wrap">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="researcher-search-icon">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              className="researcher-search"
              type="text"
              placeholder="Search users, projects, samples, regions…"
              value={search}
              autoFocus
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button type="button" className="search-clear" onClick={() => setSearch("")}>✕</button>
            )}
          </div>
        </div>

        <div className="researcher-results">
          {browseableUsers.length === 0 ? (
            <div className="researcher-empty">
              <p>No other users are registered yet.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="researcher-empty">
              <p>No users match "<strong>{search}</strong>".</p>
            </div>
          ) : (
            <>
              <p className="researcher-count">
                {filtered.length} user{filtered.length !== 1 ? "s" : ""} found
                {search && ` for "${search}"`}
              </p>
              <div className="researcher-grid">
                {filtered.map((u, i) => {
                  const counts  = getProjectCounts(u.username);
                  const regions = getRegions(u.username);
                  return (
                    <div
                      key={i}
                      className="researcher-user-card"
                      onClick={() => nav(`/user/${encodeURIComponent(u.username)}`)}
                    >
                      <div className="ruc-avatar">
                        {u.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="ruc-body">
                        <div className="ruc-username">{u.username}</div>
                        <div className="ruc-role-row">
                          <span className={`role-chip ${u.role === "researcher" ? "researcher-chip" : "user-chip"}`}>
                            {u.role === "researcher" ? "Researcher" : "User"}
                          </span>
                        </div>
                        {counts.total > 0 ? (
                          <div className="ruc-project-counts">
                            {counts.multisensor > 0 && (
                              <span className="project-type-badge multisensor">{counts.multisensor} MultiSensor</span>
                            )}
                            {counts.dosing > 0 && (
                              <span className="project-type-badge dosing">{counts.dosing} Dosing</span>
                            )}
                            {counts.merged > 0 && (
                              <span className="project-type-badge" style={{ background: "#f3effe", color: "#7c3aed" }}>
                                {counts.merged} Merged
                              </span>
                            )}
                          </div>
                        ) : (
                          <p className="ruc-no-projects">No projects yet</p>
                        )}
                        {regions.length > 0 && (
                          <div className="ruc-regions">
                            {regions.map((r, ri) => (
                              <span key={ri} className="ruc-region-tag">{r}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <svg className="ruc-arrow" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                      </svg>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
