import { useMemo, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { EditModal, ConfirmModal } from "../components/EditModal";

// ── Types ─────────────────────────────────────────────────────────────────────
type DataPoint = {
  x: number; y: number;
  sampleName?: string; region?: string; parameter?: string;
  projectName?: string;
};

type SampleEntry = { id?: string; sampleName: string; region: string; projectName?: string };

type BackendProject = {
  id: string; name: string;
  system_type: "multisensor" | "dosing";
  created_at: string; manual_only: boolean;
  samples: { id: string; sample_name: string; region: string }[];
};

type BackendReading = {
  id: string; parameter: string; value: number; unit: string;
  source: string; sample_id: string | null; recorded_at: string;
};

type DosingJob = {
  id: string; source_name: string; liquid: string;
  volume_ml: number | null; moles: number | null; concentration: number | null;
  image_path: string; processed_at: string;
};

type MergedProjectOut = {
  id: string; name: string;
  project_a_id: string; project_b_id: string;
  project_a: BackendProject | null;
  project_b: BackendProject | null;
  created_at: string;
  owner_username?: string;
};

type PageTab = "data" | "charts";

const API = "http://localhost:8000";
function token() { return localStorage.getItem("token") || ""; }

const PARAMETERS = ["pH", "Temperature (C)", "Turbidity (NTU)", "TDS (ppm)", "Conductivity"];

const PARAM_COLORS: Record<string, string> = {
  "pH": "#2f86c7", "Temperature (C)": "#f59e0b",
  "Turbidity (NTU)": "#8 b5cf6", "TDS (ppm)": "#10b981", "Conductivity": "#ef4444",
};

const PARAM_RANGES: Record<string, { min: number; max: number; safeMin: number; safeMax: number; unit: string }> = {
  "pH":              { min: 0,    max: 14,   safeMin: 6.5, safeMax: 8.5,  unit: "" },
  "Temperature (C)": { min: 0,    max: 50,   safeMin: 10,  safeMax: 35,   unit: "°C" },
  "Turbidity (NTU)": { min: 0,    max: 100,  safeMin: 0,   safeMax: 5,    unit: " NTU" },
  "TDS (ppm)":       { min: 0,    max: 1000, safeMin: 0,   safeMax: 500,  unit: " ppm" },
  "Conductivity":    { min: 0,    max: 2000, safeMin: 0,   safeMax: 1000, unit: " µS" },
};

// ── Gauge chart ───────────────────────────────────────────────────────────────
function GaugeChart({ param, value }: { param: string; value: number }) {
  const range = PARAM_RANGES[param];
  if (!range) return null;
  const { min, max, safeMin, safeMax, unit } = range;
  const SIZE = 200, cx = 100, cy = 100, R = 74, SW = 18, GAP = 0.18;
  const startAngle = Math.PI / 2 + GAP * Math.PI;
  const totalSweep = 2 * Math.PI * (1 - GAP);
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  function pt(a: number) { return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }; }
  function arcPath(fromA: number, sweep: number, colour: string, sw = SW) {
    if (sweep <= 0) return null;
    const s = pt(fromA), e = pt(fromA + sweep);
    return <path d={`M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${R} ${R} 0 ${sweep > Math.PI ? 1 : 0} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`} fill="none" stroke={colour} strokeWidth={sw} strokeLinecap="round" />;
  }
  function pickColor(): string {
    if (value < safeMin) { const p = (safeMin - value) / (safeMin - min + 0.001); return p < 0.3 ? "#FCC055" : p < 0.6 ? "#EB8D50" : "#DF6E5B"; }
    if (value <= safeMax) return (value - safeMin) / (safeMax - safeMin + 0.001) < 0.85 ? "#4FB1A1" : "#FCC055";
    return (value - safeMax) / (max - safeMax + 0.001) < 0.4 ? "#EB8D50" : "#DF6E5B";
  }
  const arcColor = pickColor(), valueSweep = totalSweep * pct, dotPt = pt(startAngle + valueSweep);
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: "100%", maxWidth: 190 }}>
      {arcPath(startAngle, totalSweep, "#e8edf2", SW + 2)}
      {pct > 0 && arcPath(startAngle, valueSweep, arcColor, SW)}
      {pct > 0.01 && pct < 0.99 && <circle cx={dotPt.x.toFixed(2)} cy={dotPt.y.toFixed(2)} r="9" fill={arcColor} />}
      <circle cx={cx} cy={cy} r="46" fill={arcColor} opacity="0.12" />
      <circle cx={cx} cy={cy} r="38" fill={arcColor} />
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="20" fontWeight="800" fill="white" fontFamily="inherit">{value}<tspan fontSize="12" fontWeight="600">{unit || "°"}</tspan></text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize="8.5" fill="rgba(255,255,255,0.8)" fontFamily="inherit">{param.split(" ")[0]}</text>
    </svg>
  );
}

// ── Radar chart ───────────────────────────────────────────────────────────────
function RadarChart({ data, color = "#2f86c7" }: { sampleName: string; data: DataPoint[]; color?: string }) {
  const params = Object.keys(PARAM_RANGES), n = params.length;
  const cx = 120, cy = 120, r = 90;
  function angle(i: number) { return (i / n) * 2 * Math.PI - Math.PI / 2; }
  function point(i: number, pct: number) { return { x: cx + r * pct * Math.cos(angle(i)), y: cy + r * pct * Math.sin(angle(i)) }; }
  const scores = params.map(p => { const dp = data.find(d => d.parameter === p); if (!dp) return 0; const rng = PARAM_RANGES[p]; return Math.max(0, Math.min(1, (dp.y - rng.min) / (rng.max - rng.min))); });
  const hasData = scores.some(s => s > 0);
  const polyPoints = params.map((_, i) => point(i, scores[i]));
  return (
    <svg viewBox="0 0 240 240" style={{ width: "100%", maxWidth: 240 }}>
      {[0.25, 0.5, 0.75, 1].map(ring => <polygon key={ring} points={params.map((_, i) => { const p = point(i, ring); return `${p.x},${p.y}`; }).join(" ")} fill="none" stroke="#e8ecf0" strokeWidth="0.8" />)}
      {params.map((_, i) => { const p = point(i, 1); return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#e8ecf0" strokeWidth="0.8" />; })}
      {hasData && <><polygon points={polyPoints.map(p => `${p.x},${p.y}`).join(" ")} fill={`${color}20`} stroke={color} strokeWidth="1.5" />{polyPoints.map((p, i) => scores[i] > 0 && <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} />)}</>}
      {params.map((param, i) => { const p = point(i, 1.22); return <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fontSize="9" fill="#4a5568" fontWeight="500">{param.split(" ")[0]}</text>; })}
      {!hasData && <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize="11" fill="#8896a8">No data</text>}
    </svg>
  );
}

// ── Line chart ────────────────────────────────────────────────────────────────
function LineChart({ points, color }: { points: DataPoint[]; color: string; label: string }) {
  if (points.length === 0) return <p className="no-data">No data.</p>;
  const W = 400, H = 120, PAD = { top: 16, right: 16, bottom: 24, left: 36 };
  const innerW = W - PAD.left - PAD.right, innerH = H - PAD.top - PAD.bottom;
  const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y)), rangeY = maxY - minY || 1;
  function sx(i: number) { return PAD.left + (i / Math.max(points.length - 1, 1)) * innerW; }
  function sy(v: number) { return PAD.top + (1 - (v - minY) / rangeY) * innerH; }
  const polyline = points.map((p, i) => `${sx(i)},${sy(p.y)}`).join(" ");
  const area = `M ${sx(0)} ${sy(points[0].y)} ` + points.map((p, i) => `L ${sx(i)} ${sy(p.y)}`).join(" ") + ` L ${sx(points.length - 1)} ${H - PAD.bottom} L ${sx(0)} ${H - PAD.bottom} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%" }}>
      <path d={area} fill={color} opacity="0.08" />
      {[minY, (minY + maxY) / 2, maxY].map((v, i) => <g key={i}><line x1={PAD.left} y1={sy(v)} x2={W - PAD.right} y2={sy(v)} stroke="#e8ecf0" strokeWidth="0.8" strokeDasharray="3 3" /><text x={PAD.left - 4} y={sy(v)} textAnchor="end" dominantBaseline="central" fontSize="8" fill="#8896a8">{Number(v.toFixed(1))}</text></g>)}
      {points.map((p, i) => <text key={i} x={sx(i)} y={H - 6} textAnchor="middle" fontSize="8" fill="#8896a8">{p.sampleName ? p.sampleName.split(" ")[0] : i + 1}</text>)}
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => <circle key={i} cx={sx(i)} cy={sy(p.y)} r="3" fill={color} />)}
    </svg>
  );
}

// ── Heatmap ───────────────────────────────────────────────────────────────────
function HeatmapChart({ samples, manualData }: { samples: SampleEntry[]; manualData: DataPoint[] }) {
  const params = PARAMETERS.filter(p => p !== "Other");
  if (samples.length === 0) return <p className="no-data">No samples yet.</p>;
  function getValue(sampleName: string, param: string) { const dp = manualData.find(d => d.sampleName === sampleName && d.parameter === param); return dp ? dp.y : null; }
  function cellColor(val: number | null, param: string) {
    if (val === null) return "#f4f6f8";
    const rng = PARAM_RANGES[param]; if (!rng) return "#e8ecf0";
    const pct = Math.max(0, Math.min(1, (val - rng.min) / (rng.max - rng.min)));
    return pct < 0.5 ? "#4FB1A1" : pct < 0.75 ? "#FCC055" : pct < 0.9 ? "#EB8D50" : "#DF6E5B";
  }
  const LABEL_W = 80, HEADER_H = 26, CELL_H = 22, GAP = 3;
  const CELL_W = Math.floor((560 - LABEL_W - params.length * GAP) / params.length);
  const totalW = LABEL_W + params.length * (CELL_W + GAP), totalH = HEADER_H + samples.length * (CELL_H + GAP) + 4;
  return (
    <div style={{ width: "100%" }}>
      <svg viewBox={`0 0 ${totalW} ${totalH}`} style={{ width: "100%", display: "block" }}>
        {params.map((p, pi) => <text key={pi} x={LABEL_W + pi * (CELL_W + GAP) + CELL_W / 2} y={HEADER_H - 7} textAnchor="middle" fontSize="8" fontWeight="600" fill="#94a3b8">{p.split(" ")[0].slice(0, 4).toUpperCase()}</text>)}
        {samples.map((s, si) => {
          const ry = HEADER_H + si * (CELL_H + GAP);
          return (
            <g key={si}>
              <text x={LABEL_W - 5} y={ry + CELL_H / 2} textAnchor="end" dominantBaseline="central" fontSize="9" fontWeight="600" fill="#334155">{s.sampleName.length > 9 ? s.sampleName.slice(0, 9) + "…" : s.sampleName}</text>
              {params.map((p, pi) => { const val = getValue(s.sampleName, p), bg = cellColor(val, p), cx2 = LABEL_W + pi * (CELL_W + GAP); return <g key={pi}><rect x={cx2} y={ry} width={CELL_W} height={CELL_H} rx="3" fill={bg} /><text x={cx2 + CELL_W / 2} y={ry + CELL_H / 2} textAnchor="middle" dominantBaseline="central" fontSize="8.5" fontWeight="700" fill={val === null ? "#c0cad4" : "#fff"}>{val === null ? "—" : Number(val.toFixed(1))}</text></g>; })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(ts: string) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

async function fetchDosingJobs(projectId: string): Promise<DosingJob[]> {
  const res = await fetch(`${API}/dosing/${projectId}/jobs?per_page=200`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.items || [];
}

async function fetchProjectReadings(projectId: string): Promise<BackendReading[]> {
  const all: BackendReading[] = [];
  let page = 1;
  while (true) {
    const res = await fetch(`${API}/multisensor/${projectId}/readings?page=${page}&per_page=500`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (!res.ok) break;
    const data = await res.json();
    all.push(...data.items);
    if (all.length >= data.total || data.items.length === 0) break;
    page++;
  }
  return all;
}

function scoreForSample(sampleName: string, data: DataPoint[]): number {
  const points = data.filter(p => p.sampleName === sampleName);
  if (points.length === 0) return 0;
  let score = 100, checked = 0;
  for (const p of points) {
    const param = p.parameter || "";
    if (param === "pH")               { checked++; if (p.y < 6.5 || p.y > 8.5) score -= 25; }
    else if (param === "Turbidity (NTU)") { checked++; if (p.y > 5)   score -= 25; }
    else if (param === "TDS (ppm)")   { checked++; if (p.y > 500)  score -= 25; }
    else if (param === "Temperature (C)") { checked++; if (p.y > 35)  score -= 15; }
  }
  return checked > 0 ? Math.max(0, score) : 0;
}

function qualityLabel(score: number) {
  if (score >= 85) return "Excellent"; if (score >= 70) return "Good";
  if (score >= 50) return "Fair"; if (score > 0) return "Poor"; return "No data";
}

function qualityColor(score: number) {
  if (score >= 85) return "#4FB1A1"; if (score >= 70) return "#84cc16";
  if (score >= 50) return "#f59e0b"; if (score > 0) return "#DF6E5B"; return "#94a3b8";
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MergedProjectPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const mergedId = decodeURIComponent(id || "");

  const [merged,    setMerged]    = useState<MergedProjectOut | null>(null);
  const [projectA,  setProjectA]  = useState<BackendProject | null>(null);
  const [projectB,  setProjectB]  = useState<BackendProject | null>(null);
  const [readingsA, setReadingsA] = useState<BackendReading[]>([]);
  const [readingsB, setReadingsB] = useState<BackendReading[]>([]);
  const [dosingJobsA, setDosingJobsA] = useState<DosingJob[]>([]);
  const [dosingJobsB, setDosingJobsB] = useState<DosingJob[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<PageTab>("data");
  const [selectedSample, setSelectedSample] = useState("");
  const [confirmDeleteSample, setConfirmDeleteSample] = useState<{name: string; id: string; projectId: string} | null>(null);

  async function renameSample(sampleName: string, sampleId: string, projectId: string, currentRegion: string) {
    setMergeSampleError("");
    setEditSampleForMerge({ sampleName, sampleId, projectId, currentRegion });
  }

  const [editSampleForMerge, setEditSampleForMerge] = useState<{ sampleName: string; sampleId: string; projectId: string; currentRegion: string } | null>(null);
  const [mergeSampleError, setMergeSampleError] = useState("");

  async function doRenameSample(newName: string, newRegion: string) {
    if (!editSampleForMerge) return;
    const { sampleName, sampleId, projectId } = editSampleForMerge;
    try {
      const res = await fetch(`${API}/multisensor/${projectId}/samples/${sampleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ sample_name: newName.trim(), region: newRegion }),
      });
      if (!res.ok) { setMergeSampleError("Could not rename sample."); return; }
      if (selectedSample === sampleName) setSelectedSample(newName.trim());
      setEditSampleForMerge(null);
      await load();
    } catch { setMergeSampleError("Could not connect to server."); }
  }

  async function deleteSampleById(sampleName: string, sampleId: string, projectId: string) {
    try {
      await fetch(`${API}/multisensor/${projectId}/samples/${sampleId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (selectedSample === sampleName) setSelectedSample("");
      setConfirmDeleteSample(null);
      await load();
    } catch { alert("Could not delete sample."); }
  }

  async function fetchLiveProject(pid: string): Promise<BackendProject | null> {
    const msRes = await fetch(`${API}/multisensor/projects/${pid}`, { headers: { Authorization: `Bearer ${token()}` } });
    if (msRes.ok) return msRes.json();
    if (msRes.status === 404) {
      const dosRes = await fetch(`${API}/dosing/projects/${pid}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (dosRes.ok) return dosRes.json();
    }
    return null;
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/merged/projects/${mergedId}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) { setNotFound(true); setLoading(false); return; }
      const m: MergedProjectOut = await res.json();

      const [liveA, liveB] = await Promise.all([
        fetchLiveProject(m.project_a_id),
        fetchLiveProject(m.project_b_id),
      ]);

      const resolvedA = liveA ?? m.project_a;
      const resolvedB = liveB ?? m.project_b;

      setMerged(m);
      setProjectA(resolvedA);
      setProjectB(resolvedB);

      const [rA, rB] = await Promise.all([
        fetchProjectReadings(m.project_a_id),
        fetchProjectReadings(m.project_b_id),
      ]);
      setReadingsA(rA);
      setReadingsB(rB);

      const [jA, jB] = await Promise.all([
        resolvedA?.system_type === "dosing" ? fetchDosingJobs(m.project_a_id) : Promise.resolve([]),
        resolvedB?.system_type === "dosing" ? fetchDosingJobs(m.project_b_id) : Promise.resolve([]),
      ]);
      setDosingJobsA(jA);
      setDosingJobsB(jB);
    } catch { setNotFound(true); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [mergedId]);

  // Combine all readings into unified DataPoints, tagging each with its project name
  const manualData: DataPoint[] = useMemo(() => {
    if (!merged) return [];
    const fromA = readingsA.map((r, i) => {
      const sample = projectA?.samples.find(s => s.id === r.sample_id);
      return { x: i + 1, y: r.value, sampleName: sample?.sample_name || "Unknown", region: sample?.region || "", parameter: r.parameter, projectName: projectA?.name };
    });
    const fromB = readingsB.map((r, i) => {
      const sample = projectB?.samples.find(s => s.id === r.sample_id);
      return { x: fromA.length + i + 1, y: r.value, sampleName: sample?.sample_name || "Unknown", region: sample?.region || "", parameter: r.parameter, projectName: projectB?.name };
    });
    return [...fromA, ...fromB];
  }, [merged, projectA, projectB, readingsA, readingsB]);

  const allKnownSamples: SampleEntry[] = useMemo(() => {
    if (!merged) return [];
    const seen = new Map<string, SampleEntry>();
    for (const p of (projectA?.samples || [])) seen.set(p.sample_name, { id: p.id, sampleName: p.sample_name, region: p.region, projectName: projectA?.name });
    for (const p of (projectB?.samples || [])) if (!seen.has(p.sample_name)) seen.set(p.sample_name, { id: p.id, sampleName: p.sample_name, region: p.region, projectName: projectB?.name });
    for (const p of manualData) if (p.sampleName && p.sampleName !== "Unknown" && !seen.has(p.sampleName)) seen.set(p.sampleName, { sampleName: p.sampleName, region: p.region || "", projectName: p.projectName });
    return Array.from(seen.values());
  }, [merged, projectA, projectB, manualData]);

  const parameterGroups: Record<string, DataPoint[]> = useMemo(() => {
    const g: Record<string, DataPoint[]> = {};
    for (const p of manualData) { const k = p.parameter || "Other"; if (!g[k]) g[k] = []; g[k].push(p); }
    return g;
  }, [manualData]);

  const parameterKeys = Object.keys(parameterGroups);

  const manualCountBySample: Record<string, number> = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of manualData) { const k = p.sampleName || "Unknown"; c[k] = (c[k] || 0) + 1; }
    return c;
  }, [manualData]);

  const activeSample = selectedSample || allKnownSamples[0]?.sampleName || "";
  const activeSampleData = manualData.filter(d => d.sampleName === activeSample);
  const gaugeParams = Object.keys(PARAM_RANGES).filter(p => activeSampleData.some(d => d.parameter === p));

  const sampleScores = useMemo(() =>
    allKnownSamples.map(s => ({ ...s, score: scoreForSample(s.sampleName, manualData) })).sort((a, b) => b.score - a.score),
    [allKnownSamples, manualData]
  );

  function logout() {
    localStorage.removeItem("token"); localStorage.removeItem("currentUser");
    nav("/signin", { replace: true });
  }

  async function exportData(format: "json" | "csv") {
    if (!merged) return;
    // Export both projects and combine
    const blobs = await Promise.all(
      [merged.project_a_id, merged.project_b_id].map(pid =>
        fetch(`${API}/exports/${pid}/${format}`, { headers: { Authorization: `Bearer ${token()}` } })
          .then(r => r.ok ? r.blob() : null)
      )
    );
    blobs.forEach((blob, i) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${merged.name.replace(/ /g, "_")}_part${i + 1}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  if (loading) return <div style={{ padding: "2rem" }}><p style={{ color: "var(--ink-3)" }}>Loading merged project…</p></div>;

  if (notFound || !merged) return (
    <div style={{ padding: "2rem" }}>
      <h2>Merged project not found</h2>
      <p>This project may have been deleted or you don't have access to it.</p>
      <button type="button" onClick={() => nav("/profile")}>Back to Profile</button>
    </div>
  );

  const projAName = projectA?.name || merged.project_a?.name || "Project A";
  const projBName = projectB?.name || merged.project_b?.name || "Project B";

  function projectColor(proj: typeof projectA) {
    if (!proj) return "#94a3b8";
    return proj.system_type === "dosing" ? "#10b981" : proj.system_type === "multisensor" ? "#2f86c7" : "#8b5cf6";
  }
  const colorA = projectColor(projectA);
  const colorB = projectColor(projectB);

  return (
    <div className="project-data-page">
      {/* TOPBAR */}
      <header className="topbar">
        <div className="topbar-left">
          <div className="logo" style={{ cursor: "pointer" }} onClick={() => nav("/app")}>
            <img src="/logocerte.png" alt="CERTE logo" />
            <strong>CERTE</strong>
          </div>
          <button type="button" className="back-btn" onClick={() => {
            const role = (() => { try { return JSON.parse(localStorage.getItem("currentUser") || "{}").role; } catch { return "user"; } })();
            if ((role === "admin" || role === "researcher") && merged?.owner_username) {
              nav(`/user/${encodeURIComponent(merged.owner_username)}`);
            } else {
              nav("/profile");
            }
          }}>← Profile</button>
          <h1 className="topbar-project-name">{merged.name}</h1>
          <span className="card-type-badge merged" style={{ marginLeft: 8, fontSize: 11 }}>Merged</span>
        </div>
        <div className="export-actions">
          <button type="button" onClick={() => load()}>↻ Refresh</button>
          <button type="button" onClick={() => exportData("json")}>Export JSON</button>
          <button type="button" onClick={() => exportData("csv")}>Export CSV</button>
          <button className="logout-btn" type="button" onClick={logout}>Logout</button>
        </div>
      </header>

      <div className="project-layout">
        {/* SIDEBAR */}
        <aside className="project-sidebar">
          {/* Source projects info */}
          <div className="project-info-panel" style={{ marginBottom: 12 }}>
            <div className="system-badge">Merged Project</div>
            <div className="info-section-title" style={{ marginTop: 10 }}>Source projects</div>
            <div className="info-row" style={{ flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: colorA, display: "inline-block" }} />
                <span className="info-value" style={{ fontSize: 12 }}>{projAName}</span>
                <span className="card-type-badge" style={{ fontSize: 10, padding: "1px 6px", background: colorA, color: "#fff", borderRadius: 4 }}>
                  {projectA?.system_type || "—"}
                </span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: colorB, display: "inline-block" }} />
                <span className="info-value" style={{ fontSize: 12 }}>{projBName}</span>
                <span className="card-type-badge" style={{ fontSize: 10, padding: "1px 6px", background: colorB, color: "#fff", borderRadius: 4 }}>
                  {projectB?.system_type || "—"}
                </span>
              </span>
            </div>
          </div>

          {/* All samples */}
          <div className="project-info-panel">
            <div className="info-section-title">{allKnownSamples.length} Sample{allKnownSamples.length !== 1 ? "s" : ""}</div>
            <ul className="info-list">
              {allKnownSamples.map((s, i) => {
                const count = manualCountBySample[s.sampleName] || 0;
                const isFromA = s.projectName === projAName;
                return (
                  <li key={i} className="info-sample-item">
                    <div className="info-sample-header">
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: isFromA ? colorA : colorB, display: "inline-block", flexShrink: 0 }} />
                      <span className="info-list-index">#{i + 1}</span>
                      <span className="info-sample-name">{s.sampleName || "—"}</span>
                    </div>
                    <div className="info-sample-region">{s.region || "—"}</div>
                    {count > 0 && <div className="info-sample-count">{count} entr{count === 1 ? "y" : "ies"}</div>}
                    {s.id && (
                      <div className="info-sample-actions">
                        <button type="button" className="icon-btn rename-btn"
                          title={`Rename ${s.sampleName}`}
                          onClick={() => renameSample(s.sampleName, s.id!, isFromA ? merged.project_a_id : merged.project_b_id, s.region)}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button type="button" className="icon-btn delete-btn"
                          title={`Delete ${s.sampleName}`}
                          onClick={() => setConfirmDeleteSample({ name: s.sampleName, id: s.id!, projectId: isFromA ? merged.project_a_id : merged.project_b_id })}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6"/><path d="M14 11v6"/>
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                          </svg>
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <div style={{ marginTop: 10, fontSize: 11, color: "var(--ink-3)", padding: "0 4px" }}>
            Created {formatDate(merged.created_at)}
          </div>
        </aside>

        {/* MAIN */}
        <main className="project-main-full">
          {/* TAB BAR */}
          <div className="page-tab-bar">
            <button type="button" className={`page-tab${activeTab === "data" ? " active" : ""}`} onClick={() => setActiveTab("data")}>
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              Data
            </button>
            <button type="button" className={`page-tab${activeTab === "charts" ? " active" : ""}`} onClick={() => setActiveTab("charts")}>
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Charts
            </button>
          </div>

          {/* DATA TAB */}
          {activeTab === "data" && (
            <div className="project-main">

              {/* Dosing jobs from project A */}
              {dosingJobsA.length > 0 && (
                <div className="graph-card" style={{ gridColumn: "1 / -1" }}>
                  <div className="chart-header">
                    <span className="chart-param-dot" style={{ background: colorA }} />
                    <h2>Dosing jobs — {projAName}</h2>
                  </div>
                  <table className="quality-table">
                    <thead><tr><th>Source</th><th>Liquid</th><th>Volume (mL)</th><th>Moles</th><th>Concentration</th><th>Date</th></tr></thead>
                    <tbody>
                      {dosingJobsA.map(j => (
                        <tr key={j.id}>
                          <td style={{ fontWeight: 600 }}>{j.source_name}</td>
                          <td>{j.liquid}</td>
                          <td>{j.volume_ml != null ? j.volume_ml.toFixed(2) : "—"}</td>
                          <td>{j.moles != null ? j.moles.toFixed(4) : "—"}</td>
                          <td>{j.concentration != null ? j.concentration.toFixed(4) : "—"}</td>
                          <td style={{ color: "var(--ink-3)", fontSize: 12 }}>{new Date(j.processed_at).toLocaleDateString("en-GB")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Dosing jobs from project B */}
              {dosingJobsB.length > 0 && (
                <div className="graph-card" style={{ gridColumn: "1 / -1" }}>
                  <div className="chart-header">
                    <span className="chart-param-dot" style={{ background: colorB }} />
                    <h2>Dosing jobs — {projBName}</h2>
                  </div>
                  <table className="quality-table">
                    <thead><tr><th>Source</th><th>Liquid</th><th>Volume (mL)</th><th>Moles</th><th>Concentration</th><th>Date</th></tr></thead>
                    <tbody>
                      {dosingJobsB.map(j => (
                        <tr key={j.id}>
                          <td style={{ fontWeight: 600 }}>{j.source_name}</td>
                          <td>{j.liquid}</td>
                          <td>{j.volume_ml != null ? j.volume_ml.toFixed(2) : "—"}</td>
                          <td>{j.moles != null ? j.moles.toFixed(4) : "—"}</td>
                          <td>{j.concentration != null ? j.concentration.toFixed(4) : "—"}</td>
                          <td style={{ color: "var(--ink-3)", fontSize: 12 }}>{new Date(j.processed_at).toLocaleDateString("en-GB")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {manualData.length === 0 && dosingJobsA.length === 0 && dosingJobsB.length === 0 ? (
                <div className="graph-card" style={{ gridColumn: "1 / -1" }}>
                  <h2>Combined data</h2>
                  <p className="no-data">No data recorded in either project yet.</p>
                </div>
              ) : manualData.length > 0 && (
                parameterKeys.map(param => {
                  const points = parameterGroups[param];
                  const maxY = Math.max(...points.map(p => Math.abs(p.y)), 1);
                  const color = PARAM_COLORS[param] ?? "#2f86c7";
                  const MAX_BAR_PX = 160;
                  return (
                    <div key={param} className="graph-card">
                      <div className="chart-header">
                        <span className="chart-param-dot" style={{ background: color }} />
                        <h2>{param}</h2>
                      </div>
                      <div className="bar-chart">
                        {points.map((point, i) => (
                          <div key={i} className="bar-col" title={`${point.sampleName} (${point.region}) [${point.projectName}]: ${point.y}`}>
                            <span className="bar-label">{point.y}</span>
                            <div className="bar" style={{ height: `${(Math.abs(point.y) / maxY) * MAX_BAR_PX}px`, background: color }} />
                            <span className="bar-x">{point.sampleName?.split(" ")[0] ?? i + 1}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}

              <div className="quality-card" style={{ gridColumn: "1 / -1" }}>
                <h2>Water quality</h2>
                {sampleScores.length === 0 ? (
                  <p className="no-data">No data to score yet.</p>
                ) : sampleScores.length === 1 ? (
                  <>
                    <div className="quality-bar"><div className="quality-fill" style={{ width: `${Math.min(sampleScores[0].score, 100)}%` }} /></div>
                    <p>Quality score: {sampleScores[0].score}/100</p>
                  </>
                ) : (
                  <table className="quality-table">
                    <thead>
                      <tr><th>Rank</th><th>Sample</th><th>Region</th><th>Project</th><th>Score</th><th>Quality</th><th style={{ width: "30%" }}>Rating</th></tr>
                    </thead>
                    <tbody>
                      {sampleScores.map((s, i) => (
                        <tr key={s.sampleName}>
                          <td className="quality-rank">{i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "3rd" : `${i + 1}th`}</td>
                          <td style={{ fontWeight: 600 }}>{s.sampleName}</td>
                          <td style={{ color: "var(--ink-3)", fontSize: 13 }}>{s.region}</td>
                          <td style={{ fontSize: 12 }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.projectName === projAName ? colorA : colorB, display: "inline-block" }} />
                              {s.projectName}
                            </span>
                          </td>
                          <td style={{ fontWeight: 700, color: qualityColor(s.score) }}>{s.score > 0 ? `${s.score}/100` : "—"}</td>
                          <td><span className="quality-badge" style={{ background: qualityColor(s.score) }}>{qualityLabel(s.score)}</span></td>
                          <td><div className="quality-bar quality-bar-sm"><div className="quality-fill" style={{ width: `${s.score}%`, background: qualityColor(s.score) }} /></div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* CHARTS TAB */}
          {activeTab === "charts" && (
            <div className="charts-tab">
              {manualData.length === 0 ? (
                <div className="graph-card charts-empty"><p className="no-data">No data in either project yet.</p></div>
              ) : (
                <>
                  {allKnownSamples.length > 1 && (
                    <div className="chart-sample-selector">
                      <span className="chart-sample-label">Sample view:</span>
                      {allKnownSamples.map(s => (
                        <button key={s.sampleName} type="button"
                          className={`chart-sample-btn${activeSample === s.sampleName ? " active" : ""}`}
                          onClick={() => setSelectedSample(s.sampleName)}
                          style={{ borderColor: s.projectName === projAName ? colorA : colorB }}
                        >
                          {s.sampleName}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="charts-row">
                    <div className="graph-card charts-radar-card">
                      <h2>Parameter radar — {activeSample}</h2>
                      <p className="chart-subtitle">Shape shows relative parameter levels</p>
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <RadarChart sampleName={activeSample} data={activeSampleData}
                          color={allKnownSamples.find(s => s.sampleName === activeSample)?.projectName === projAName ? colorA : colorB} />
                      </div>
                    </div>
                    <div className="graph-card charts-gauge-card">
                      <h2>Live gauges — {activeSample}</h2>
                      <p className="chart-subtitle">Green arc = safe range · Red = out of range</p>
                      {gaugeParams.length === 0 ? (
                        <p className="no-data">No recognized parameters for gauges.</p>
                      ) : (
                        <div className="gauge-grid">
                          {gaugeParams.map(param => {
                            const dp = activeSampleData.filter(d => d.parameter === param);
                            const latest = dp[dp.length - 1];
                            return (
                              <div key={param} className="gauge-item">
                                <div className="gauge-param-label">{param}</div>
                                <GaugeChart param={param} value={latest.y} />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="graph-card" style={{ gridColumn: "1 / -1" }}>
                    <h2>Trends — all samples over time</h2>
                    <p className="chart-subtitle">Each line shows how a parameter value changes across samples</p>
                    <div className="line-charts-grid">
                      {parameterKeys.map(param => {
                        const points = parameterGroups[param];
                        const color = PARAM_COLORS[param] ?? "#2f86c7";
                        return (
                          <div key={param} className="line-chart-item">
                            <div className="chart-header">
                              <span className="chart-param-dot" style={{ background: color }} />
                              <span style={{ fontSize: 12, fontWeight: 600 }}>{param}</span>
                            </div>
                            <LineChart points={points} color={color} label={param} />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="graph-card" style={{ gridColumn: "1 / -1" }}>
                    <h2>Heatmap — samples × parameters</h2>
                    <p className="chart-subtitle">Color intensity shows parameter value · Green = safe · Red = unsafe</p>
                    <HeatmapChart samples={allKnownSamples} manualData={manualData} />
                  </div>
                </>
              )}
            </div>
          )}
        </main>
      </div>

      {editSampleForMerge && (
        <EditModal
          title={`Edit sample — ${editSampleForMerge.sampleName}`}
          fields={[
            { id: "name", label: "Sample name", defaultValue: editSampleForMerge.sampleName, maxLength: 18 },
            { id: "region", label: "Region", defaultValue: editSampleForMerge.currentRegion, maxLength: 25, placeholder: "e.g. North Zone" },
          ]}
          error={mergeSampleError}
          onClose={() => { setEditSampleForMerge(null); setMergeSampleError(""); }}
          onSave={v => doRenameSample(v.name, v.region)}
        />
      )}

      {confirmDeleteSample && (
        <ConfirmModal
          title="Delete sample"
          message={<>Delete <strong>{confirmDeleteSample.name}</strong>? This will remove the sample and all its data.</>}
          confirmLabel="Yes, delete"
          danger
          onClose={() => setConfirmDeleteSample(null)}
          onConfirm={() => deleteSampleById(confirmDeleteSample.name, confirmDeleteSample.id, confirmDeleteSample.projectId)}
        />
      )}
    </div>
  );
}
