import { api } from "../api/api";
import { useMemo, useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

type BackendProject = {
  id: string; name: string; system_type: "multisensor" | "dosing" | "merged";
  created_at: string; manual_only: boolean;
  samples: { id: string; sample_name: string; region: string }[];
};

export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const nav = useNavigate();
  const [search, setSearch] = useState("");
  const [projects, setProjects] = useState<BackendProject[]>([]);
  const [loading, setLoading] = useState(true);

  const decoded = decodeURIComponent(username || "");
  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem("currentUser") || "{}"); }
    catch { return {}; }
  })();
  const role: string = currentUser.role || "researcher";
  const backPath  = role === "admin" ? "/admin" : "/browse";
  const backLabel = role === "admin" ? "← Admin" : "← Browse";

  useEffect(() => {
    if (!localStorage.getItem("token") || !decoded) return;
    api.get(`/users/${encodeURIComponent(decoded)}/projects`)
    .then(r => r.ok ? r.json() : [])
    .then(setProjects)
    .catch(() => {})
    .finally(() => setLoading(false));
  }, [decoded]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.samples.some(s => s.sample_name.toLowerCase().includes(q) || s.region.toLowerCase().includes(q))
    );
  }, [search, projects]);

  const multisensorProjects = filtered.filter(p => p.system_type === "multisensor");
  const dosingProjects      = filtered.filter(p => p.system_type === "dosing");
  const mergedProjects      = filtered.filter(p => p.system_type === "merged");

  const allRegions = useMemo(() => {
    const s = new Set<string>();
    projects.forEach(p => p.samples.forEach(sm => { if (sm.region) s.add(sm.region); }));
    return Array.from(s);
  }, [projects]);

  function logout() {
    localStorage.removeItem("token"); localStorage.removeItem("currentUser");
    nav("/signin", { replace: true });
  }

  function formatDate(ts: string) {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <div className="profile-page">
      <header className="topbar">
        <div className="topbar-left">
          <div className="logo" style={{ cursor: "pointer" }} onClick={() => nav("/app")}>
            <img src="/logocerte.png" alt="CERTE logo" />
            <strong>CERTE</strong>
          </div>
          <button type="button" className="back-btn" onClick={() => nav(backPath)}>{backLabel}</button>
          <span className="topbar-project-name">{decoded}</span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="logout-btn" type="button" onClick={logout}>Logout</button>
        </div>
      </header>

      <div className="profile-layout">
        <aside className="profile-sidenav">
          <div className="profile-avatar">
            <div className="avatar-circle">{decoded.charAt(0).toUpperCase()}</div>
            <div className="avatar-name">{decoded}</div>
            <div className="avatar-sub">
              {loading ? "Loading…" : `${projects.length} project${projects.length !== 1 ? "s" : ""}`}
            </div>
          </div>

          {allRegions.length > 0 && (
            <div className="public-regions-panel">
              <p className="sidenav-label">Regions covered</p>
              <div className="public-regions-list">
                {allRegions.map((r, i) => <span key={i} className="ruc-region-tag">{r}</span>)}
              </div>
            </div>
          )}

          <div className="public-stats-panel">
            <p className="sidenav-label">Summary</p>
            <div className="public-stat-row"><span>MultiSensor</span><span className="public-stat-val">{projects.filter(p => p.system_type === "multisensor").length}</span></div>
            <div className="public-stat-row"><span>Dosing</span><span className="public-stat-val">{projects.filter(p => p.system_type === "dosing").length}</span></div>
          </div>

          <div className="readonly-notice">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            View-only profile
          </div>
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
          {!loading && projects.length === 0 && <p className="no-data" style={{ marginTop: 24 }}>This user has no projects yet.</p>}
          {!loading && filtered.length === 0 && search && <p className="no-data" style={{ marginTop: 24 }}>No projects match "{search}".</p>}

          {multisensorProjects.length > 0 && (
            <div className="profile-section">
              <div className="profile-section-header">
                <span className="section-dot multisensor-dot" />
                <h2>MultiSensor Projects</h2>
                <span className="section-count">{multisensorProjects.length}</span>
              </div>
              <div className="profile-projects-grid">
               {multisensorProjects.map(p => (
                  <div
                   key={p.id}
                   className="profile-project-card multisensor-card public-card"
                   onClick={() => nav(`/view-project/${encodeURIComponent(p.id)}`)}
                   >
                    <div className="card-top">
                      <span className="card-type-badge multisensor">MultiSensor</span>
                      <span className="card-date">{formatDate(p.created_at)}</span>
                    </div>
                    <div className="card-name">{p.name}</div>
                    {p.samples.length > 0 && (
                      <div className="card-samples-preview">
                        {p.samples.slice(0, 3).map((s, si) => (
                          <span key={si} className="card-sample-tag">{s.sample_name}{s.region ? ` · ${s.region}` : ""}</span>
                        ))}
                        {p.samples.length > 3 && <span className="card-sample-tag card-sample-more">+{p.samples.length - 3} more</span>}
                      </div>
                    )}
                    <div className="card-meta">{p.samples.length > 0 ? `${p.samples.length} sample${p.samples.length !== 1 ? "s" : ""}` : "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dosingProjects.length > 0 && (
            <div className="profile-section">
              <div className="profile-section-header">
                <span className="section-dot dosing-dot" />
                <h2>Dosing Projects</h2>
                <span className="section-count">{dosingProjects.length}</span>
              </div>
              <div className="profile-projects-grid">
                {dosingProjects.map(p => (
                  <div key={p.id} className="profile-project-card dosing-card public-card"
                    onClick={() => nav(`/view-project/${encodeURIComponent(p.id)}`)}>
                    <div className="card-top">
                      <span className="card-type-badge dosing">Dosing</span>
                      <span className="card-date">{formatDate(p.created_at)}</span>
                    </div>
                    <div className="card-name">{p.name}</div>
                    <div className="card-meta">{p.samples.length > 0 ? `${p.samples.length} source${p.samples.length !== 1 ? "s" : ""}` : "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mergedProjects.length > 0 && (
            <div className="profile-section">
              <div className="profile-section-header">
                <span className="section-dot merged-dot" />
                <h2>Merged Projects</h2>
                <span className="section-count">{mergedProjects.length}</span>
              </div>
              <div className="profile-projects-grid">
                {mergedProjects.map(p => (
                  <div key={p.id} className="profile-project-card merged-card public-card"
                    onClick={() => nav(`/merged-project/${encodeURIComponent(p.id)}`)}>
                    <div className="card-top">
                      <span className="card-type-badge merged">Merged</span>
                      <span className="card-date">{formatDate(p.created_at)}</span>
                    </div>
                    <div className="card-name">{p.name}</div>
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