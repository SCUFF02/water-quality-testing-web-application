import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";

type BackendUser = {
  id: string;
  username: string;
  email: string;
  role: "user" | "researcher" | "admin";
  created_at: string;
};

type BackendProject = {
  id: string;
  name: string;
  system_type: "multisensor" | "dosing";
  created_at: string;
  user_id: string;
  samples: { id: string; sample_name: string; region: string }[];
};

type UserWithProjects = BackendUser & {
  projects: BackendProject[];
};

const API = "http://localhost:8000";

function token() {
  return localStorage.getItem("token") || "";
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
      ...(opts.headers || {}),
    },
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(text || `Request failed with status ${res.status}`);
  }

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

function parseErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return "Something went wrong.";

  try {
    const parsed = JSON.parse(err.message);

    if (typeof parsed?.detail === "string") {
      return parsed.detail;
    }

    if (Array.isArray(parsed?.detail)) {
      return parsed.detail.map((x: any) => x?.msg || JSON.stringify(x)).join(", ");
    }

    return err.message;
  } catch {
    return err.message || "Something went wrong.";
  }
}

export default function ResearcherPage() {
  const nav = useNavigate();

  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<UserWithProjects[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("currentUser") || "{}");
    } catch {
      return {};
    }
  }, []);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError("");

        if (!token()) {
          setError("You are not logged in. Please sign in again.");
          setUsers([]);
          return;
        }

        // Use the correct route your backend allows for researchers.
        // If /users is still admin-only in your backend, replace it with
        // a researcher-safe route like /users/browse once you create it.
        const allUsers: BackendUser[] = await apiFetch("/users");

        const others = allUsers.filter(
          (u) => u.username !== currentUser.username && u.role !== "admin"
        );

        const results = await Promise.all(
          others.map(async (u) => {
            try {
              const projs: BackendProject[] = await apiFetch(
                `/users/${encodeURIComponent(u.username)}/projects`
              );

              return {
                ...u,
                projects: Array.isArray(projs) ? projs : [],
              };
            } catch (err) {
              console.error(`Failed loading projects for ${u.username}:`, err);
              return {
                ...u,
                projects: [],
              };
            }
          })
        );

        setUsers(results);
      } catch (err) {
        console.error("Failed to load researcher page:", err);
        setError(parseErrorMessage(err));
        setUsers([]);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [currentUser.username]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;

    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.projects.some(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.samples.some(
              (s) =>
                s.sample_name.toLowerCase().includes(q) ||
                s.region.toLowerCase().includes(q)
            )
        )
    );
  }, [search, users]);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("currentUser");
    nav("/signin", { replace: true });
  }

  function getRegions(u: UserWithProjects): string[] {
    const regions = new Set<string>();
    u.projects.forEach((p) =>
      p.samples.forEach((s) => {
        if (s.region) regions.add(s.region);
      })
    );
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
          <button
            type="button"
            className="back-btn"
            onClick={() => nav("/app")}
          >
            ← Dashboard
          </button>
          <button className="logout-btn" type="button" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      <div className="researcher-layout">
        <div className="researcher-hero">
          <h1 className="researcher-hero-title">Browse researchers</h1>
          <p className="researcher-hero-sub">
            Search by username, project name, sample name, or region
          </p>

          <div className="researcher-search-wrap">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="researcher-search-icon"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>

            <input
              className="researcher-search"
              type="text"
              autoFocus
              placeholder="Search users, projects, samples, regions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            {search && (
              <button
                type="button"
                className="search-clear"
                onClick={() => setSearch("")}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="researcher-results">
          {loading ? (
            <div className="researcher-empty">
              <p>Loading users…</p>
            </div>
          ) : error ? (
            <div className="researcher-empty">
              <p>{error}</p>
            </div>
          ) : users.length === 0 ? (
            <div className="researcher-empty">
              <p>No other users are registered yet.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="researcher-empty">
              <p>
                No users match <strong>"{search}"</strong>.
              </p>
            </div>
          ) : (
            <>
              <p className="researcher-count">
                {filtered.length} user{filtered.length !== 1 ? "s" : ""} found
                {search && ` for "${search}"`}
              </p>

              <div className="researcher-grid">
                {filtered.map((u) => {
                  const ms = u.projects.filter(
                    (p) => p.system_type === "multisensor"
                  ).length;
                  const dos = u.projects.filter(
                    (p) => p.system_type === "dosing"
                  ).length;
                  const regions = getRegions(u);

                  return (
                    <div
                      key={u.id}
                      className="researcher-user-card"
                      onClick={() =>
                        nav(`/user/${encodeURIComponent(u.username)}`)
                      }
                    >
                      <div className="ruc-avatar">
                        {u.username.charAt(0).toUpperCase()}
                      </div>

                      <div className="ruc-body">
                        <div className="ruc-username">{u.username}</div>

                        <div className="ruc-role-row">
                          <span
                            className={`role-chip ${
                              u.role === "researcher"
                                ? "researcher-chip"
                                : "user-chip"
                            }`}
                          >
                            {u.role === "researcher" ? "Researcher" : "User"}
                          </span>
                        </div>

                        {u.projects.length > 0 ? (
                          <div className="ruc-project-counts">
                            {ms > 0 && (
                              <span className="project-type-badge multisensor">
                                {ms} MultiSensor
                              </span>
                            )}
                            {dos > 0 && (
                              <span className="project-type-badge dosing">
                                {dos} Dosing
                              </span>
                            )}
                          </div>
                        ) : (
                          <p className="ruc-no-projects">No projects yet</p>
                        )}

                        {regions.length > 0 && (
                          <div className="ruc-regions">
                            {regions.map((r, i) => (
                              <span key={i} className="ruc-region-tag">
                                {r}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <svg
                        className="ruc-arrow"
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
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