import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";

type RegisteredUser = {
  username: string;
  email: string;
  password: string;
  role: "admin" | "user" | "researcher";
};

type SavedProject = {
  userId: string;
  projectName: string;
  systemType: "multisensor" | "dosing";
  timestamp: string;
  formData: Record<string, unknown>;
  manualData: unknown[];
  collectedData: unknown[];
};

type AdminView = "dashboard" | "users" | "projects";

export default function AdminPage() {
  const nav = useNavigate();
  const [view, setView] = useState<AdminView>("dashboard");
  const [userSearch, setUserSearch] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<"all" | "multisensor" | "dosing">("all");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [users, setUsers] = useState<RegisteredUser[]>(() =>
    JSON.parse(localStorage.getItem("registeredUsers") || "[]")
  );
  const [projects, setProjects] = useState<SavedProject[]>(() =>
    JSON.parse(localStorage.getItem("savedProjects") || "[]")
  );

  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem("currentUser") || "{}"); }
    catch { return {}; }
  })();

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("currentUser");
    nav("/signin", { replace: true });
  }

  function deleteUser(username: string) {
    const updated = users.filter((u) => u.username !== username);
    setUsers(updated);
    localStorage.setItem("registeredUsers", JSON.stringify(updated));
    setConfirmDelete(null);
  }

  function setUserRole(username: string, newRole: "user" | "researcher" | "admin") {
    if (username === currentUser.username) return;
    const updated = users.map((u) =>
      u.username === username ? { ...u, role: newRole } : u
    );
    setUsers(updated as RegisteredUser[]);
    localStorage.setItem("registeredUsers", JSON.stringify(updated));
  }

  function deleteProject(projectName: string) {
    const updated = projects.filter((p) => p.projectName !== projectName);
    setProjects(updated);
    localStorage.setItem("savedProjects", JSON.stringify(updated));
  }

  function formatDate(ts: string) {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return users;
    const q = userSearch.toLowerCase();
    return users.filter(
      (u) => u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  const filteredProjects = useMemo(() => {
    let list = projects;
    if (projectFilter !== "all") list = list.filter((p) => p.systemType === projectFilter);
    if (projectSearch.trim()) {
      const q = projectSearch.toLowerCase();
      list = list.filter(
        (p) => p.projectName.toLowerCase().includes(q) || p.userId.toLowerCase().includes(q)
      );
    }
    return [...list].reverse();
  }, [projects, projectFilter, projectSearch]);

  const stats = {
    totalUsers: users.filter((u) => u.role !== "admin").length,
    totalAdmins: users.filter((u) => u.role === "admin").length,
    totalProjects: projects.length,
    multisensor: projects.filter((p) => p.systemType === "multisensor").length,
    dosing: projects.filter((p) => p.systemType === "dosing").length,
  };

  const recentProjects = [...projects].reverse().slice(0, 5);

  return (
    <div className="admin-page">

      {/* TOPBAR */}
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

        {/* SIDEBAR */}
        <aside className="admin-sidebar">
          <p className="admin-nav-label">Overview</p>
          <button
            type="button"
            className={`admin-nav-item${view === "dashboard" ? " active" : ""}`}
            onClick={() => setView("dashboard")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            Dashboard
          </button>
          <button
            type="button"
            className={`admin-nav-item${view === "users" ? " active" : ""}`}
            onClick={() => setView("users")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Users
            <span className="admin-nav-count">{users.length}</span>
          </button>
          <button
            type="button"
            className={`admin-nav-item${view === "projects" ? " active" : ""}`}
            onClick={() => setView("projects")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            Projects
            <span className="admin-nav-count">{projects.length}</span>
          </button>
        </aside>

        {/* MAIN CONTENT */}
        <main className="admin-main">

          {/* ── DASHBOARD VIEW ── */}
          {view === "dashboard" && (
            <>
              <div className="admin-stats-grid">
                <div className="admin-stat-card">
                  <div className="admin-stat-label">Regular users</div>
                  <div className="admin-stat-value">{stats.totalUsers}</div>
                </div>
                <div className="admin-stat-card">
                  <div className="admin-stat-label">Admins</div>
                  <div className="admin-stat-value">{stats.totalAdmins}</div>
                </div>
                <div className="admin-stat-card">
                  <div className="admin-stat-label">Total projects</div>
                  <div className="admin-stat-value">{stats.totalProjects}</div>
                </div>
                <div className="admin-stat-card">
                  <div className="admin-stat-label">MultiSensor</div>
                  <div className="admin-stat-value" style={{ color: "var(--accent)" }}>{stats.multisensor}</div>
                </div>
                <div className="admin-stat-card">
                  <div className="admin-stat-label">Dosing</div>
                  <div className="admin-stat-value" style={{ color: "var(--green)" }}>{stats.dosing}</div>
                </div>
              </div>

              <div className="admin-section-card">
                <div className="admin-section-header">
                  <span className="admin-section-title">Recent projects</span>
                  <button type="button" className="btn-ghost admin-view-all-btn" onClick={() => setView("projects")}>
                    View all →
                  </button>
                </div>
                {recentProjects.length === 0 ? (
                  <p className="no-data" style={{ padding: "24px 0" }}>No projects yet.</p>
                ) : (
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Project</th>
                        <th>Owner</th>
                        <th>Type</th>
                        <th>Created</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentProjects.map((p, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{p.projectName}</td>
                          <td style={{ color: "var(--ink-2)" }}>{p.userId}</td>
                          <td>
                            <span className={`project-type-badge ${p.systemType}`}>
                              {p.systemType === "multisensor" ? "MultiSensor" : "Dosing"}
                            </span>
                          </td>
                          <td style={{ color: "var(--ink-3)", fontFamily: "var(--mono)", fontSize: 12 }}>
                            {formatDate(p.timestamp)}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn-ghost admin-action-btn"
                              onClick={() => nav(`/project/${encodeURIComponent(p.projectName)}`)}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {/* ── USERS VIEW ── */}
          {view === "users" && (
            <div className="admin-section-card">
              <div className="admin-section-header">
                <span className="admin-section-title">All users</span>
                <input
                  type="text"
                  placeholder="Search users…"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  style={{ width: 200, padding: "6px 10px", fontSize: 12 }}
                />
              </div>
              {filteredUsers.length === 0 ? (
                <p className="no-data" style={{ padding: "24px 0" }}>No users found.</p>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Projects</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u, i) => {
                      const userProjects = projects.filter((p) => p.userId === u.username);
                      const isSelf = u.username === currentUser.username;
                      return (
                        <tr key={i}>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div className="admin-avatar" style={
                                u.role === "admin"
                                  ? { background: "var(--accent-subtle)", color: "var(--accent)" }
                                  : {}
                              }>
                                {u.username.charAt(0).toUpperCase()}
                              </div>
                              <span style={{ fontWeight: 500 }}>{u.username}</span>
                              {isSelf && <span className="admin-self-tag">you</span>}
                            </div>
                          </td>
                          <td style={{ color: "var(--ink-2)", fontSize: 12 }}>{u.email}</td>
                          <td>
                            <span className={`admin-role-badge ${u.role}`}>
                              {u.role === "admin" ? "Admin" : u.role === "researcher" ? "Researcher" : "User"}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                              {userProjects.filter((p) => p.systemType === "multisensor").length > 0 && (
                                <span className="project-type-badge multisensor" style={{ fontSize: 10 }}>
                                  {userProjects.filter((p) => p.systemType === "multisensor").length} Multi
                                </span>
                              )}
                              {userProjects.filter((p) => p.systemType === "dosing").length > 0 && (
                                <span className="project-type-badge dosing" style={{ fontSize: 10 }}>
                                  {userProjects.filter((p) => p.systemType === "dosing").length} Dos
                                </span>
                              )}
                              {userProjects.length === 0 && <span style={{ color: "var(--ink-3)", fontSize: 12 }}>—</span>}
                            </div>
                          </td>
                          <td>
                            {isSelf ? (
                              <span style={{ color: "var(--ink-3)", fontSize: 12 }}>current session</span>
                            ) : (
                              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                                <button type="button" className="admin-action-btn"
                                  onClick={() => nav(`/user/${encodeURIComponent(u.username)}`)}>
                                  View profile
                                </button>
                                {u.role === "user" && (
                                  <button type="button" className="admin-action-btn admin-promote-btn"
                                    onClick={() => setUserRole(u.username, "researcher")}>
                                    → Researcher
                                  </button>
                                )}
                                {u.role === "researcher" && (
                                  <>
                                    <button type="button" className="admin-action-btn admin-demote-btn"
                                      onClick={() => setUserRole(u.username, "user")}>
                                      → User
                                    </button>
                                    <button type="button" className="admin-action-btn admin-promote-btn"
                                      onClick={() => setUserRole(u.username, "admin")}>
                                      → Admin
                                    </button>
                                  </>
                                )}
                                {u.role === "admin" && (
                                  <button type="button" className="admin-action-btn admin-demote-btn"
                                    onClick={() => setUserRole(u.username, "researcher")}>
                                    → Researcher
                                  </button>
                                )}
                                <button type="button" className="admin-action-btn admin-delete-btn"
                                  onClick={() => setConfirmDelete(u.username)}>
                                  Delete
                                </button>
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

          {/* ── PROJECTS VIEW ── */}
          {view === "projects" && (
            <div className="admin-section-card">
              <div className="admin-section-header">
                <span className="admin-section-title">All projects</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div className="admin-filter-tabs">
                    {(["all", "multisensor", "dosing"] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        className={`admin-filter-tab${projectFilter === f ? " active" : ""}`}
                        onClick={() => setProjectFilter(f)}
                      >
                        {f === "all" ? "All" : f === "multisensor" ? "MultiSensor" : "Dosing"}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    placeholder="Search projects…"
                    value={projectSearch}
                    onChange={(e) => setProjectSearch(e.target.value)}
                    style={{ width: 180, padding: "6px 10px", fontSize: 12 }}
                  />
                </div>
              </div>
              {filteredProjects.length === 0 ? (
                <p className="no-data" style={{ padding: "24px 0" }}>No projects found.</p>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Owner</th>
                      <th>Type</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProjects.map((p, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{p.projectName}</td>
                        <td style={{ color: "var(--ink-2)" }}>{p.userId}</td>
                        <td>
                          <span className={`project-type-badge ${p.systemType}`}>
                            {p.systemType === "multisensor" ? "MultiSensor" : "Dosing"}
                          </span>
                        </td>
                        <td style={{ color: "var(--ink-3)", fontFamily: "var(--mono)", fontSize: 12 }}>
                          {formatDate(p.timestamp)}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 5 }}>
                            <button
                              type="button"
                              className="btn-ghost admin-action-btn"
                              onClick={() => nav(`/project/${encodeURIComponent(p.projectName)}`)}
                            >
                              View
                            </button>
                            <button
                              type="button"
                              className="admin-action-btn admin-delete-btn"
                              onClick={() => deleteProject(p.projectName)}
                            >
                              Delete
                            </button>
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

      {/* ── CONFIRM DELETE MODAL ── */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete user</h3>
            <p style={{ textAlign: "center", color: "var(--ink-2)", marginBottom: 20, fontSize: 13 }}>
              Are you sure you want to delete <strong>{confirmDelete}</strong>? This cannot be undone.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                style={{ background: "var(--danger)", borderColor: "var(--danger)" }}
                onClick={() => deleteUser(confirmDelete)}
              >
                Yes, delete
              </button>
              <button type="button" onClick={() => setConfirmDelete(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

