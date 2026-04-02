import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";

type BackendUser = {
  id:         string;
  username:   string;
  email:      string;
  role:       "admin" | "user" | "researcher";
  created_at: string;
};

type BackendProject = {
  id:          string;
  name:        string;
  system_type: "multisensor" | "dosing";
  created_at:  string;
  user_id:     string;
  samples:     { id: string; sample_name: string; region: string }[];
};

type AdminView = "dashboard" | "users" | "projects";

import { api, BASE_URL } from "../api/api";

async function apiFetch(path: string, opts: RequestInit = {}) {
  const method = (opts.method || "GET").toUpperCase();
  let res: Response;
  if (method === "DELETE") res = await api.del(path);
  else if (method === "PATCH") res = await api.patch(path, opts.body ? JSON.parse(opts.body as string) : {});
  else if (method === "POST") res = await api.post(path, opts.body ? JSON.parse(opts.body as string) : {});
  else res = await api.get(path);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function AdminPage() {
  const nav = useNavigate();
  const [view, setView]               = useState<AdminView>("dashboard");
  const [userSearch, setUserSearch]   = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<"all" | "multisensor" | "dosing">("all");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [users, setUsers]       = useState<BackendUser[]>([]);
  const [projects, setProjects] = useState<BackendProject[]>([]);
  const [loading, setLoading]   = useState(true);

  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem("currentUser") || "{}"); }
    catch { return {}; }
  })();

  // Fetch all users + all projects on load
  useEffect(() => {
    Promise.all([
      apiFetch("/users/all"),
      apiFetch("/multisensor/projects").catch(() => []),
      apiFetch("/dosing/projects").catch(() => []),
    ])
    .then(([allUsers, ms, dos]) => {
      setUsers(allUsers);
      // We need ALL users' projects — fetch per user
      // For now combine ms + dos (these return only current user's projects)
      // So fetch each user's projects separately
      const nonAdmins = (allUsers as BackendUser[]).filter(u => u.role !== "admin");
      return Promise.all(
        nonAdmins.map(u =>
          api.get(`/users/${encodeURIComponent(u.username)}/projects`).then(r => r.ok ? r.json() : [])
          .then((projs: BackendProject[]) => projs.map(p => ({ ...p, ownerUsername: u.username })))
        )
      ).then(results => {
        setProjects(results.flat());
      });
    })
    .catch(console.error)
    .finally(() => setLoading(false));
  }, []);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("currentUser");
    nav("/signin", { replace: true });
  }

  async function deleteUser(userId: string) {
    try {
      await apiFetch(`/users/${userId}`, { method: "DELETE" });
      setUsers(prev => prev.filter(u => u.id !== userId));
      setConfirmDelete(null);
    } catch (e) { console.error(e); }
  }

  async function setUserRole(userId: string, newRole: "user" | "researcher" | "admin") {
    try {
      const updated = await apiFetch(`/users/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role: newRole }),
      });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: updated.role } : u));
    } catch (e) { console.error(e); }
  }

  function formatDate(ts: string) {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return users;
    const q = userSearch.toLowerCase();
    return users.filter(u => u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [users, userSearch]);

  const filteredProjects = useMemo(() => {
    let list = projects as any[];
    if (projectFilter !== "all") list = list.filter(p => p.system_type === projectFilter);
    if (projectSearch.trim()) {
      const q = projectSearch.toLowerCase();
      list = list.filter(p => p.name?.toLowerCase().includes(q) || p.ownerUsername?.toLowerCase().includes(q));
    }
    return [...list].reverse();
  }, [projects, projectFilter, projectSearch]);

  const stats = {
    totalUsers:   users.filter(u => u.role !== "admin").length,
    totalAdmins:  users.filter(u => u.role === "admin").length,
    totalProjects: projects.length,
    multisensor:  projects.filter(p => p.system_type === "multisensor").length,
    dosing:       projects.filter(p => p.system_type === "dosing").length,
  };

  const recentProjects = [...projects].reverse().slice(0, 5) as any[];

  return (
    <div className="admin-page">
      <header className="topbar">
        <div className="logo">
          <img src="/logocerte.png" alt="CERTE logo" />
          <strong>CERTE</strong>
          <span className="admin-badge">ADMIN</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="admin-topbar-user">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            {currentUser.username}
          </span>
          <button className="logout-btn" type="button" onClick={logout}>Logout</button>
        </div>
      </header>

      <div className="admin-layout">
        <aside className="admin-sidebar">
          <p className="admin-nav-label">Overview</p>
          <button type="button" className={`admin-nav-item${view === "dashboard" ? " active" : ""}`} onClick={() => setView("dashboard")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            Dashboard
          </button>
          <button type="button" className={`admin-nav-item${view === "users" ? " active" : ""}`} onClick={() => setView("users")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Users
            <span className="admin-nav-count">{users.length}</span>
          </button>
          <button type="button" className={`admin-nav-item${view === "projects" ? " active" : ""}`} onClick={() => setView("projects")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            Projects
            <span className="admin-nav-count">{projects.length}</span>
          </button>
        </aside>

        <main className="admin-main">

          {loading && <p style={{ padding: 24, color: "var(--ink-3)" }}>Loading…</p>}

          {/* DASHBOARD */}
          {!loading && view === "dashboard" && (
            <>
              <div className="admin-stats-grid">
                <div className="admin-stat-card"><div className="admin-stat-label">Regular users</div><div className="admin-stat-value">{stats.totalUsers}</div></div>
                <div className="admin-stat-card"><div className="admin-stat-label">Admins</div><div className="admin-stat-value">{stats.totalAdmins}</div></div>
                <div className="admin-stat-card"><div className="admin-stat-label">Total projects</div><div className="admin-stat-value">{stats.totalProjects}</div></div>
                <div className="admin-stat-card"><div className="admin-stat-label">MultiSensor</div><div className="admin-stat-value" style={{ color: "var(--accent)" }}>{stats.multisensor}</div></div>
                <div className="admin-stat-card"><div className="admin-stat-label">Dosing</div><div className="admin-stat-value" style={{ color: "var(--green)" }}>{stats.dosing}</div></div>
              </div>

              <div className="admin-section-card">
                <div className="admin-section-header">
                  <span className="admin-section-title">Recent projects</span>
                  <button type="button" className="btn-ghost admin-view-all-btn" onClick={() => setView("projects")}>View all →</button>
                </div>
                {recentProjects.length === 0 ? (
                  <p className="no-data" style={{ padding: "24px 0" }}>No projects yet.</p>
                ) : (
                  <table className="admin-table">
                    <thead><tr><th>Project</th><th>Owner</th><th>Type</th><th>Created</th><th>Actions</th></tr></thead>
                    <tbody>
                      {recentProjects.map((p, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{p.name}</td>
                          <td style={{ color: "var(--ink-2)" }}>{p.ownerUsername}</td>
                          <td><span className={`project-type-badge ${p.system_type}`}>{p.system_type === "multisensor" ? "MultiSensor" : "Dosing"}</span></td>
                          <td style={{ color: "var(--ink-3)", fontFamily: "var(--mono)", fontSize: 12 }}>{formatDate(p.created_at)}</td>
                          <td>
                            <button type="button" className="btn-ghost admin-action-btn"
                              onClick={() => nav(`/admin/project/${encodeURIComponent(p.name)}`)}>View</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {/* USERS */}
          {!loading && view === "users" && (
            <div className="admin-section-card">
              <div className="admin-section-header">
                <span className="admin-section-title">All users</span>
                <input type="text" placeholder="Search users…" value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  style={{ width: 200, padding: "6px 10px", fontSize: 12 }} />
              </div>
              {filteredUsers.length === 0 ? (
                <p className="no-data" style={{ padding: "24px 0" }}>No users found.</p>
              ) : (
                <table className="admin-table">
                  <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Projects</th><th>Actions</th></tr></thead>
                  <tbody>
                    {filteredUsers.map((u) => {
                      const userProjects = projects.filter((p: any) => p.ownerUsername === u.username);
                      const isSelf = u.username === currentUser.username;
                      return (
                        <tr key={u.id}>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div className="admin-avatar" style={u.role === "admin" ? { background: "var(--accent-subtle)", color: "var(--accent)" } : {}}>
                                {u.username.charAt(0).toUpperCase()}
                              </div>
                              <span style={{ fontWeight: 500 }}>{u.username}</span>
                              {isSelf && <span className="admin-self-tag">you</span>}
                            </div>
                          </td>
                          <td style={{ color: "var(--ink-2)", fontSize: 12 }}>{u.email}</td>
                          <td><span className={`admin-role-badge ${u.role}`}>{u.role === "admin" ? "Admin" : u.role === "researcher" ? "Researcher" : "User"}</span></td>
                          <td>
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                              {userProjects.filter((p: any) => p.system_type === "multisensor").length > 0 && (
                                <span className="project-type-badge multisensor" style={{ fontSize: 10 }}>{userProjects.filter((p: any) => p.system_type === "multisensor").length} Multi</span>
                              )}
                              {userProjects.filter((p: any) => p.system_type === "dosing").length > 0 && (
                                <span className="project-type-badge dosing" style={{ fontSize: 10 }}>{userProjects.filter((p: any) => p.system_type === "dosing").length} Dos</span>
                              )}
                              {userProjects.length === 0 && <span style={{ color: "var(--ink-3)", fontSize: 12 }}>—</span>}
                            </div>
                          </td>
                          <td>
                            {isSelf ? (
                              <span style={{ color: "var(--ink-3)", fontSize: 12 }}>current session</span>
                            ) : (
                              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                                <button type="button" className="admin-action-btn" onClick={() => nav(`/user/${encodeURIComponent(u.username)}`)}>View profile</button>
                                {u.role === "user" && <button type="button" className="admin-action-btn admin-promote-btn" onClick={() => setUserRole(u.id, "researcher")}>→ Researcher</button>}
                                {u.role === "researcher" && <>
                                  <button type="button" className="admin-action-btn admin-demote-btn" onClick={() => setUserRole(u.id, "user")}>→ User</button>
                                  <button type="button" className="admin-action-btn admin-promote-btn" onClick={() => setUserRole(u.id, "admin")}>→ Admin</button>
                                </>}
                                {u.role === "admin" && <button type="button" className="admin-action-btn admin-demote-btn" onClick={() => setUserRole(u.id, "researcher")}>→ Researcher</button>}
                                <button type="button" className="admin-action-btn admin-delete-btn" onClick={() => setConfirmDelete(u.id)}>Delete</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* PROJECTS */}
          {!loading && view === "projects" && (
            <div className="admin-section-card">
              <div className="admin-section-header">
                <span className="admin-section-title">All projects</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div className="admin-filter-tabs">
                    {(["all", "multisensor", "dosing"] as const).map(f => (
                      <button key={f} type="button" className={`admin-filter-tab${projectFilter === f ? " active" : ""}`} onClick={() => setProjectFilter(f)}>
                        {f === "all" ? "All" : f === "multisensor" ? "MultiSensor" : "Dosing"}
                      </button>
                    ))}
                  </div>
                  <input type="text" placeholder="Search projects…" value={projectSearch}
                    onChange={(e) => setProjectSearch(e.target.value)}
                    style={{ width: 180, padding: "6px 10px", fontSize: 12 }} />
                </div>
              </div>
              {filteredProjects.length === 0 ? (
                <p className="no-data" style={{ padding: "24px 0" }}>No projects found.</p>
              ) : (
                <table className="admin-table">
                  <thead><tr><th>Project</th><th>Owner</th><th>Type</th><th>Created</th><th>Actions</th></tr></thead>
                  <tbody>
                    {filteredProjects.map((p: any, i: number) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{p.name}</td>
                        <td style={{ color: "var(--ink-2)" }}>{p.ownerUsername}</td>
                        <td><span className={`project-type-badge ${p.system_type}`}>{p.system_type === "multisensor" ? "MultiSensor" : "Dosing"}</span></td>
                        <td style={{ color: "var(--ink-3)", fontFamily: "var(--mono)", fontSize: 12 }}>{formatDate(p.created_at)}</td>
                        <td>
                          <div style={{ display: "flex", gap: 5 }}>
                            <button type="button" className="btn-ghost admin-action-btn" onClick={() => nav(`/admin/project/${encodeURIComponent(p.name)}`)}>View</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

        </main>
      </div>

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete user</h3>
            <p style={{ textAlign: "center", color: "var(--ink-2)", marginBottom: 20, fontSize: 13 }}>
              Are you sure you want to delete this user? This cannot be undone.
            </p>
            <div className="modal-actions">
              <button type="button" style={{ background: "var(--danger)", borderColor: "var(--danger)" }} onClick={() => deleteUser(confirmDelete)}>Yes, delete</button>
              <button type="button" onClick={() => setConfirmDelete(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}