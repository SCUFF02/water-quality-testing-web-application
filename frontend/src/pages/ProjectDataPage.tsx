import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Researcher Page
 * Now fetches real users from the backend instead of localStorage.
 */

type BackendUser = {
  id:         string;
  username:   string;
  email:      string;
  role:       "user" | "researcher" | "admin";
  created_at: string;
};

type BackendProject = {
  id:          string;
  name:        string;
  system_type: "multisensor" | "dosing";
  samples:     { id: string; sample_name: string; region: string }[];
};

type UserWithProjects = BackendUser & {
  projects: BackendProject[];
};

export default function ResearcherPage() {
  const nav = useNavigate();
  const [search, setSearch] = useState("");
  const [users, setUsers]   = useState<UserWithProjects[]>([]);
  const [loading, setLoading] = useState(true);

  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem("currentUser") || "{}"); }
    catch { return {}; }
  })();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    // Fetch all non-admin users
    fetch("http://localhost:8000/users", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then(async (userList: BackendUser[]) => {
        // Exclude self
        const others = userList.filter(u => u.username !== currentUser.username);

        // Fetch projects for each user
        const withProjects = await Promise.all(
          others.map(async (u) => {
            try {
              const res = await fetch(
                `http://localhost:8000/users/${encodeURIComponent(u.username)}/projects`,
                { headers: { Authorization: `Bearer ${token}` } }
              );
              const projects = res.ok ? await res.json() : [];
              return { ...u, projects };
            } catch {
              return { ...u, projects: [] };
            }
          })
        );
        setUsers(withProjects);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u => {
      if (u.username.toLowerCase().includes(q)) return true;
      return u.projects.some(p =>
        p.name.toLowerCase().includes(q) ||
        p.samples.some(s =>
          s.sample_name.toLowerCase().includes(q) || s.region.toLowerCase().includes(q)
        )
      );
    });
  }, [search, users]);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("currentUser");
    nav("/signin", { replace: true });
  }

  function getRegions(u: UserWithProjects): string[] {
    const regions = new Set<string>();
    u.projects.forEach(p => p.samples.forEach(s => { if (s.region) regions.add(s.region); }));
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
            <input className="researcher-search" type="text" autoFocus
              placeholder="Search users, projects, samples, regions…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button type="button" className="search-clear" onClick={() => setSearch("")}>✕</button>}
          </div>
        </div>

        <div className="researcher-results">
          {loading ? (
            <div className="researcher-empty"><p>Loading users…</p></div>
          ) : users.length === 0 ? (
            <div className="researcher-empty"><p>No other users are registered yet.</p></div>
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
                {filtered.map((u) => {
                  const ms      = u.projects.filter(p => p.system_type === "multisensor").length;
                  const dos     = u.projects.filter(p => p.system_type === "dosing").length;
                  const regions = getRegions(u);
                  return (
                    <div key={u.id} className="researcher-user-card"
                      onClick={() => nav(`/user/${encodeURIComponent(u.username)}`)}>
                      <div className="ruc-avatar">{u.username.charAt(0).toUpperCase()}</div>
                      <div className="ruc-body">
                        <div className="ruc-username">{u.username}</div>
                        <div className="ruc-role-row">
                          <span className={`role-chip ${u.role === "researcher" ? "researcher-chip" : "user-chip"}`}>
                            {u.role === "researcher" ? "Researcher" : "User"}
                          </span>
                        </div>
                        {u.projects.length > 0 ? (
                          <div className="ruc-project-counts">
                            {ms > 0 && <span className="project-type-badge multisensor">{ms} MultiSensor</span>}
                            {dos > 0 && <span className="project-type-badge dosing">{dos} Dosing</span>}
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