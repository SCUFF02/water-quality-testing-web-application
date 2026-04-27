import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { EditModal, ConfirmModal } from "../components/EditModal";

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

const API = "http://localhost:8000";

function token() { return localStorage.getItem("token") || ""; }

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}`, ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function AdminPage() {
  const nav = useNavigate();
  const [view, setView]               = useState<AdminView>("dashboard");
  const [userSearch, setUserSearch]   = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<"all" | "multisensor" | "dosing" | "merged">("all");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [users, setUsers]       = useState<BackendUser[]>([]);
  const [projects, setProjects] = useState<BackendProject[]>([]);
  const [loading, setLoading]   = useState(true);
  const [cameraIp, setCameraIp] = useState("");

  // Password change
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [pwModalOpen,  setPwModalOpen]  = useState(false);
  const [currentPw,    setCurrentPw]    = useState("");
  const [newPw,        setNewPw]        = useState("");
  const [pwError,      setPwError]      = useState("");
  const [pwSuccess,    setPwSuccess]    = useState("");

  // Rename / delete / reset-pw modals
  const [renameModal,   setRenameModal]   = useState<{ id: string; name: string; systemType: string } | null>(null);
  const [deleteModal,   setDeleteModal]   = useState<{ id: string; name: string; systemType: string } | null>(null);
  const [resetPwModal,  setResetPwModal]  = useState<{ id: string; username: string } | null>(null);
  const [deleteUserModal, setDeleteUserModal] = useState<string | null>(null);
  const [modalError,    setModalError]    = useState("");

  useEffect(() => {
    fetch(`${API}/system/settings`)
      .then(r => r.ok ? r.json() : {})
      .then(d => { if (d.camera_ip) setCameraIp(d.camera_ip); })
      .catch(() => {});
  }, []);

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
    .then(([allUsers]) => {
      setUsers(allUsers);
      // We need ALL users' projects — fetch per user
      // For now combine ms + dos (these return only current user's projects)
      // So fetch each user's projects separately
      const nonAdmins = (allUsers as BackendUser[]).filter(u => u.role !== "admin");
      return Promise.all(
        nonAdmins.map(u =>
          fetch(`${API}/users/${encodeURIComponent(u.username)}/projects`, {
            headers: { Authorization: `Bearer ${token()}` }
          }).then(r => r.ok ? r.json() : [])
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

  async function changePassword() {
    setPwError(""); setPwSuccess("");
    if (!currentPw) { setPwError("Enter your current password."); return; }
    if (newPw.length < 6) { setPwError("New password must be at least 6 characters."); return; }
    const res = await apiFetch("/users/me/change-password", { method: "POST", body: JSON.stringify({ current_password: currentPw, new_password: newPw }) });
    const d = await res.json();
    if (!res.ok) { setPwError(d.detail || "Could not change password."); return; }
    setPwSuccess("Password changed successfully.");
    setCurrentPw(""); setNewPw("");
    setTimeout(() => { setPwModalOpen(false); setPwSuccess(""); }, 1500);
  }

  async function deleteUser(userId: string) {
    try {
      await apiFetch(`/users/${userId}`, { method: "DELETE" });
      setUsers(prev => prev.filter(u => u.id !== userId));
      setConfirmDelete(null);
    } catch (e) { console.error(e); }
  }

  async function deleteProject(p: { id: string; name: string; system_type: string }) {
    setModalError("");
    setDeleteModal({ id: p.id, name: p.name, systemType: p.system_type });
  }

  async function doDeleteProject(id: string, systemType: string) {
    const endpoint = systemType === "multisensor" ? `/multisensor/projects/${id}` : `/dosing/projects/${id}`;
    try {
      await apiFetch(endpoint, { method: "DELETE" });
      setProjects((prev: any[]) => prev.filter((x: any) => x.id !== id));
    } catch { setModalError("Could not delete project."); }
    setDeleteModal(null);
  }

  async function renameProject(p: { id: string; name: string; system_type: string }) {
    setModalError("");
    setRenameModal({ id: p.id, name: p.name, systemType: p.system_type });
  }

  async function doRenameProject(id: string, systemType: string, newName: string) {
    const endpoint = systemType === "multisensor" ? `/multisensor/projects/${id}` : `/dosing/projects/${id}`;
    try {
      const res = await apiFetch(endpoint, { method: "PATCH", body: JSON.stringify({ name: newName }) });
      if (!res.ok) { const d = await res.json(); setModalError(d.detail || "Could not rename."); return; }
      setProjects((prev: any[]) => prev.map((x: any) => x.id === id ? { ...x, name: newName } : x));
      setRenameModal(null);
    } catch { setModalError("Could not connect to server."); }
  }

  async function deleteMergedProject(p: { id: string; name: string }) {
    setModalError("");
    setDeleteModal({ id: p.id, name: p.name, systemType: "merged" });
  }

  async function doDeleteMerged(id: string) {
    try {
      await apiFetch(`/merged/projects/${id}`, { method: "DELETE" });
      setProjects((prev: any[]) => prev.filter((x: any) => x.id !== id));
    } catch { setModalError("Could not delete merged project."); }
    setDeleteModal(null);
  }

  async function renameMergedProject(p: { id: string; name: string }) {
    setModalError("");
    setRenameModal({ id: p.id, name: p.name, systemType: "merged" });
  }

  async function doRenameMerged(id: string, newName: string) {
    try {
      const res = await apiFetch(`/merged/projects/${id}`, { method: "PATCH", body: JSON.stringify({ name: newName }) });
      if (!res.ok) { const d = await res.json(); setModalError(d.detail || "Could not rename."); return; }
      setProjects((prev: any[]) => prev.map((x: any) => x.id === id ? { ...x, name: newName } : x));
      setRenameModal(null);
    } catch { setModalError("Could not connect to server."); }
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
        <div className="topbar-left">
          <div className="logo" style={{ cursor: "pointer" }} onClick={() => nav("/admin")}>
            <img src="/logocerte.png" alt="CERTE logo" />
            <strong>CERTE</strong>
            <span className="admin-badge">ADMIN</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="admin-topbar-user">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            {currentUser.username}
          </span>
          <div className="user-menu-wrap">
            <button className="user-menu-btn" type="button" onClick={() => setUserMenuOpen(v => !v)}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
            {userMenuOpen && (
              <div className="user-menu-dropdown" style={{ display: "block" }}>
                <button type="button" onClick={() => { setUserMenuOpen(false); setPwModalOpen(true); setPwError(""); setPwSuccess(""); setCurrentPw(""); setNewPw(""); }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  Change password
                </button>
                <button type="button" className="user-menu-danger" onClick={logout}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  Logout
                </button>
              </div>
            )}
          </div>
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

              {/* Camera IP setting */}
              <div className="admin-section-card" style={{ marginBottom: 16 }}>
                <div className="admin-section-header">
                  <span className="admin-section-title">ESP-CAM Settings</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px 8px", overflow: "hidden" }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--ink-3)", flexShrink: 0 }}>
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                  <input type="text" placeholder="e.g. 192.168.1.45"
                    value={cameraIp}
                    onChange={e => setCameraIp(e.target.value)}
                    style={{ flex: 1, minWidth: 0, fontSize: 13, padding: "6px 10px" }} />
                  <button type="button" className="btn-ghost" style={{ whiteSpace: "nowrap", flexShrink: 0 }} onClick={async () => {
                    await fetch(`${API}/system/settings`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
                      body: JSON.stringify({ camera_ip: cameraIp.trim() }),
                    });
                    alert(cameraIp.trim() ? `Camera IP set to ${cameraIp.trim()}` : "Camera IP cleared");
                  }}>Save</button>
                </div>
                <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "0 8px 4px" }}>
                  Stream URL: <code style={{ background: "var(--bg)", padding: "1px 5px", borderRadius: 4 }}>http://[IP]/stream</code> — applies to all dosing projects.
                </p>
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
                          <td><span className={`project-type-badge ${p.system_type}`}>{p.system_type === "multisensor" ? "MultiSensor" : p.system_type === "dosing" ? "Dosing" : "Merged"}</span></td>
                          <td style={{ color: "var(--ink-3)", fontFamily: "var(--mono)", fontSize: 12 }}>{formatDate(p.created_at)}</td>
                          <td>
                            <div className="db-table-actions">
                              <button type="button" className="btn-ghost admin-action-btn"
                                onClick={() => nav(p.system_type === "merged" ? `/merged-project/${encodeURIComponent(p.id)}` : `/admin/project/${encodeURIComponent(p.id)}`)}>View</button>
                              <button type="button" className="icon-btn rename-btn"
                                onClick={() => p.system_type === "merged" ? renameMergedProject(p) : renameProject(p)} title="Rename">
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                              </button>
                              <button type="button" className="icon-btn delete-btn"
                                onClick={() => p.system_type === "merged" ? deleteMergedProject(p) : deleteProject(p)} title="Delete">
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6"/>
                                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                                  <path d="M10 11v6"/><path d="M14 11v6"/>
                                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                                </svg>
                              </button>
                            </div>
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
                                {!u.is_approved && (
                                  <button type="button" className="admin-action-btn admin-promote-btn"
                                    onClick={async () => {
                                      try { await apiFetch(`/users/${u.id}/approve`, { method: "PATCH" }); setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_approved: true } : x)); }
                                      catch { alert("Could not approve user."); }
                                    }}>✓ Approve</button>
                                )}
                                {u.is_approved && (
                                  <button type="button" className="admin-action-btn admin-demote-btn"
                                    onClick={async () => {
                                      try { await apiFetch(`/users/${u.id}/approve`, { method: "PATCH" }); setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_approved: false } : x)); }
                                      catch { alert("Could not revoke approval."); }
                                    }}>✗ Revoke</button>
                                )}
                                {u.role === "user" && <button type="button" className="admin-action-btn admin-promote-btn" onClick={() => setUserRole(u.id, "researcher")}>→ Researcher</button>}
                                {u.role === "researcher" && <>
                                  <button type="button" className="admin-action-btn admin-demote-btn" onClick={() => setUserRole(u.id, "user")}>→ User</button>
                                  <button type="button" className="admin-action-btn admin-promote-btn" onClick={() => setUserRole(u.id, "admin")}>→ Admin</button>
                                </>}
                                {u.role === "admin" && <button type="button" className="admin-action-btn admin-demote-btn" onClick={() => setUserRole(u.id, "researcher")}>→ Researcher</button>}
                                <button type="button" className="admin-action-btn admin-delete-btn" onClick={() => setDeleteUserModal(u.id)}>Delete</button>
                                <button type="button" className="icon-btn" title="Reset password"
                                  onClick={() => { setModalError(""); setResetPwModal({ id: u.id, username: u.username }); }}>
                                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                                  </svg>
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

          {/* PROJECTS */}
          {!loading && view === "projects" && (
            <div className="admin-section-card">
              <div className="admin-section-header">
                <span className="admin-section-title">All projects</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div className="admin-filter-tabs">
                    {(["all", "multisensor", "dosing", "merged"] as const).map(f => (
                      <button key={f} type="button" className={`admin-filter-tab${projectFilter === f ? " active" : ""}`} onClick={() => setProjectFilter(f)}>
                        {f === "all" ? "All" : f === "multisensor" ? "MultiSensor" : f === "dosing" ? "Dosing" : "Merged"}
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
                        <td><span className={`project-type-badge ${p.system_type}`}>{p.system_type === "multisensor" ? "MultiSensor" : p.system_type === "dosing" ? "Dosing" : "Merged"}</span></td>
                        <td style={{ color: "var(--ink-3)", fontFamily: "var(--mono)", fontSize: 12 }}>{formatDate(p.created_at)}</td>
                        <td>
                          <div className="db-table-actions">
                            <button type="button" className="btn-ghost admin-action-btn" onClick={() => nav(p.system_type === "merged" ? `/merged-project/${encodeURIComponent(p.id)}` : `/admin/project/${encodeURIComponent(p.id)}`)}>View</button>
                            <button type="button" className="icon-btn rename-btn" onClick={() => p.system_type === "merged" ? renameMergedProject(p) : renameProject(p)} title="Rename">
                              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                              </svg>
                            </button>
                            <button type="button" className="icon-btn delete-btn" onClick={() => p.system_type === "merged" ? deleteMergedProject(p) : deleteProject(p)} title="Delete">
                              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                                <path d="M10 11v6"/><path d="M14 11v6"/>
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                              </svg>
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

      {(confirmDelete || deleteUserModal) && (
        <ConfirmModal
          title="Delete user"
          message="Are you sure you want to delete this user? This cannot be undone."
          confirmLabel="Yes, delete"
          danger
          onClose={() => { setConfirmDelete(null); setDeleteUserModal(null); }}
          onConfirm={() => { const id = confirmDelete || deleteUserModal!; deleteUser(id); setDeleteUserModal(null); }}
        />
      )}

      {renameModal && (
        <EditModal
          title={`Rename "${renameModal.name}"`}
          fields={[{ id: "name", label: "New name", defaultValue: renameModal.name, maxLength: 120 }]}
          error={modalError}
          onClose={() => { setRenameModal(null); setModalError(""); }}
          onSave={v => renameModal.systemType === "merged"
            ? doRenameMerged(renameModal.id, v.name.trim())
            : doRenameProject(renameModal.id, renameModal.systemType, v.name.trim())}
        />
      )}

      {deleteModal && (
        <ConfirmModal
          title="Delete project"
          message={<>Delete <strong>{deleteModal.name}</strong>? This cannot be undone.</>}
          confirmLabel="Yes, delete"
          danger
          onClose={() => { setDeleteModal(null); setModalError(""); }}
          onConfirm={() => deleteModal.systemType === "merged"
            ? doDeleteMerged(deleteModal.id)
            : doDeleteProject(deleteModal.id, deleteModal.systemType)}
        />
      )}

      {resetPwModal && (
        <EditModal
          title={`Reset password — ${resetPwModal.username}`}
          fields={[{ id: "pw", label: "New password", type: "password", defaultValue: "", placeholder: "Min. 6 characters" }]}
          error={modalError}
          saveLabel="Reset password"
          onClose={() => { setResetPwModal(null); setModalError(""); }}
          onSave={async v => {
            if (v.pw.length < 6) { setModalError("Password must be at least 6 characters."); return; }
            try {
              await apiFetch(`/users/${resetPwModal.id}/reset-password`, { method: "POST", body: JSON.stringify({ new_password: v.pw }) });
              setResetPwModal(null); setModalError("");
            } catch { setModalError("Could not reset password."); }
          }}
        />
      )}

      {pwModalOpen && (
        <div className="modal-overlay" onClick={() => setPwModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Change password</h3>
            <label htmlFor="admin-current-pw">Current password</label>
            <input id="admin-current-pw" type="password" value={currentPw} autoFocus
              onChange={e => { setCurrentPw(e.target.value); setPwError(""); }} />
            <label htmlFor="admin-new-pw">New password</label>
            <input id="admin-new-pw" type="password" value={newPw} placeholder="Min. 6 characters"
              onChange={e => { setNewPw(e.target.value); setPwError(""); }} />
            {pwError   && <p className="form-error">{pwError}</p>}
            {pwSuccess && <p style={{ color: "var(--green)", fontSize: 13, textAlign: "center" }}>{pwSuccess}</p>}
            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button type="button" onClick={changePassword}>Save</button>
              <button type="button" onClick={() => setPwModalOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}