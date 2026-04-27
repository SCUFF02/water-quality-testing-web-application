import { useMemo, useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { EditModal, ConfirmModal } from "../components/EditModal";

// ── Types ─────────────────────────────────────────────────────────────────────
type DataPoint = {
  x: number; y: number;
  sampleName?: string; region?: string; parameter?: string;
};

type SampleEntry = { id?: string; sampleName: string; region: string };

type BackendProject = {
  id: string; name: string;
  system_type: "multisensor" | "dosing";
  created_at: string; manual_only: boolean;
  status?: "idle" | "active";
  camera_ip?: string;
  owner_username?: string;
  samples: { id: string; sample_name: string; region: string }[];
};

type DosingJob = {
  id: string; source_name: string; liquid: string;
  volume_ml: number | null; moles: number | null; concentration: number | null;
  image_path: string; image_path_after?: string; processed_at: string;
};

type BackendReading = {
  id: string; parameter: string; value: number; unit: string;
  source: string; sample_id: string | null; recorded_at: string;
};

type ModalPhase = "preloaded" | "new-sample" | "new-entry";
type PageTab = "data" | "charts";

const API = "http://localhost:8000";
function token() { return localStorage.getItem("token") || ""; }

const PARAMETERS = [
  "pH", "Temperature (C)", "Turbidity (NTU)", "TDS (ppm)", "Conductivity",
];

const PARAM_COLORS: Record<string, string> = {
  "pH":              "#2f86c7",
  "Temperature (C)": "#f59e0b",
  "Turbidity (NTU)": "#8b5cf6",
  "TDS (ppm)":       "#10b981",
  "Conductivity":    "#ef4444",
};

// WHO / standard safe ranges for gauge zones
const PARAM_RANGES: Record<string, { min: number; max: number; safeMin: number; safeMax: number; unit: string }> = {
  "pH":              { min: 0,    max: 14,   safeMin: 6.5, safeMax: 8.5,  unit: "" },
  "Temperature (C)": { min: 0,    max: 50,   safeMin: 10,  safeMax: 35,   unit: "°C" },
  "Turbidity (NTU)": { min: 0,    max: 100,  safeMin: 0,   safeMax: 5,    unit: " NTU" },
  "TDS (ppm)":       { min: 0,    max: 1000, safeMin: 0,   safeMax: 500,  unit: " ppm" },
  "Conductivity":    { min: 0,    max: 2000, safeMin: 0,   safeMax: 1000, unit: " µS" },
};

// ── Gauge chart (SVG arc) ────────────────────────────────────────────────────
function GaugeChart({ param, value }: { param: string; value: number }) {
  const range = PARAM_RANGES[param];
  if (!range) return null;
  const { min, max, safeMin, safeMax, unit } = range;

  const SIZE = 200, cx = 100, cy = 100, R = 74, SW = 18, GAP = 0.18;
  const startAngle = Math.PI / 2 + GAP * Math.PI;
  const totalSweep = 2 * Math.PI * (1 - GAP);
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));

  function pt(angle: number) {
    return { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) };
  }

  function arcPath(fromAngle: number, sweep: number, colour: string, strokeW = SW) {
    if (sweep <= 0) return null;
    const toAngle = fromAngle + sweep;
    const s = pt(fromAngle), e = pt(toAngle);
    const large = sweep > Math.PI ? 1 : 0;
    return (
      <path
        d={`M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`}
        fill="none" stroke={colour} strokeWidth={strokeW} strokeLinecap="round"
      />
    );
  }

  // Smart color based on value vs safe range
  // Below safeMin → teal (too low)
  // Within safe zone lower 75% → teal (good)
  // Approaching safeMax → yellow (caution)
  // Above safeMax → orange then red
  function pickColor(): string {
    if (value < safeMin) {
      // Below minimum: teal if just below, orange/red if very low
      const belowPct = (safeMin - value) / (safeMin - min + 0.001);
      if (belowPct < 0.3) return "#FCC055";
      if (belowPct < 0.6) return "#EB8D50";
      return "#DF6E5B";
    }
    if (value <= safeMax) {
      // Within safe range
      const withinPct = (value - safeMin) / (safeMax - safeMin + 0.001);
      if (withinPct < 0.85) return "#4FB1A1"; // teal — comfortably safe
      return "#FCC055";                        // yellow — near upper limit
    }
    // Above safeMax
    const abovePct = (value - safeMax) / (max - safeMax + 0.001);
    if (abovePct < 0.4) return "#EB8D50";  // orange
    return "#DF6E5B";                       // red
  }

  const arcColor   = pickColor();
  const valueSweep = totalSweep * pct;
  const dotAngle   = startAngle + valueSweep;
  const dotPt      = pt(dotAngle);

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: "100%", maxWidth: 190 }}>
      {arcPath(startAngle, totalSweep, "#e8edf2", SW + 2)}
      {pct > 0 && arcPath(startAngle, valueSweep, arcColor, SW)}
      {pct > 0.01 && pct < 0.99 && (
        <circle cx={dotPt.x.toFixed(2)} cy={dotPt.y.toFixed(2)} r="9" fill={arcColor} />
      )}
      <circle cx={cx} cy={cy} r="46" fill={arcColor} opacity="0.12" />
      <circle cx={cx} cy={cy} r="38" fill={arcColor} />
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="20" fontWeight="800" fill="white" fontFamily="inherit">
        {value}<tspan fontSize="12" fontWeight="600">{unit || "°"}</tspan>
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize="8.5" fill="rgba(255,255,255,0.8)" fontFamily="inherit">
        {param.split(" ")[0]}
      </text>
    </svg>
  );
}

// ── Radar chart (SVG polygon) ────────────────────────────────────────────────
function RadarChart({ data }: { sampleName: string; data: DataPoint[] }) {
  const params = Object.keys(PARAM_RANGES);
  const n = params.length;
  const cx = 120, cy = 120, r = 90;

  function angle(i: number) { return (i / n) * 2 * Math.PI - Math.PI / 2; }
  function point(i: number, pct: number) {
    return { x: cx + r * pct * Math.cos(angle(i)), y: cy + r * pct * Math.sin(angle(i)) };
  }

  const scores = params.map((param) => {
    const dp = data.find((d) => d.parameter === param);
    if (!dp) return 0;
    const range = PARAM_RANGES[param];
    return Math.max(0, Math.min(1, (dp.y - range.min) / (range.max - range.min)));
  });

  const hasData = scores.some((s) => s > 0);
  const polyPoints = params.map((_, i) => point(i, scores[i]));
  const polyStr = polyPoints.map((p) => `${p.x},${p.y}`).join(" ");

  // grid rings
  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox="0 0 240 240" style={{ width: "100%", maxWidth: 240 }}>
      {/* grid rings */}
      {rings.map((ring) => {
        const pts = params.map((_, i) => point(i, ring));
        return (
          <polygon key={ring}
            points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none" stroke="#e8ecf0" strokeWidth="0.8"/>
        );
      })}
      {/* axes */}
      {params.map((_, i) => {
        const p = point(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#e8ecf0" strokeWidth="0.8"/>;
      })}
      {/* data polygon */}
      {hasData && (
        <>
          <polygon points={polyStr} fill="#2f86c720" stroke="#2f86c7" strokeWidth="1.5"/>
          {polyPoints.map((p, i) => scores[i] > 0 && (
            <circle key={i} cx={p.x} cy={p.y} r="3" fill="#2f86c7"/>
          ))}
        </>
      )}
      {/* labels */}
      {params.map((param, i) => {
        const p = point(i, 1.22);
        const shortLabel = param.split(" ")[0];
        return (
          <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central"
            fontSize="9" fill="#4a5568" fontWeight="500">
            {shortLabel}
          </text>
        );
      })}
      {!hasData && (
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize="11" fill="#8896a8">
          No data
        </text>
      )}
    </svg>
  );
}

// ── Line chart (SVG polyline) ────────────────────────────────────────────────
function LineChart({ points, color }: { points: DataPoint[]; color: string; label: string }) {
  if (points.length === 0) return <p className="no-data">No data.</p>;
  const W = 400, H = 120, PAD = { top: 16, right: 16, bottom: 24, left: 36 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const rangeY = maxY - minY || 1;

  function sx(i: number) { return PAD.left + (i / Math.max(points.length - 1, 1)) * innerW; }
  function sy(v: number) { return PAD.top + (1 - (v - minY) / rangeY) * innerH; }

  const polyline = points.map((p, i) => `${sx(i)},${sy(p.y)}`).join(" ");
  const area = `M ${sx(0)} ${sy(points[0].y)} ` +
    points.map((p, i) => `L ${sx(i)} ${sy(p.y)}`).join(" ") +
    ` L ${sx(points.length - 1)} ${H - PAD.bottom} L ${sx(0)} ${H - PAD.bottom} Z`;

  const yTicks = [minY, (minY + maxY) / 2, maxY];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%" }}>
      {/* area fill */}
      <path d={area} fill={color} opacity="0.08"/>
      {/* y grid + labels */}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={PAD.left} y1={sy(v)} x2={W - PAD.right} y2={sy(v)}
            stroke="#e8ecf0" strokeWidth="0.8" strokeDasharray="3 3"/>
          <text x={PAD.left - 4} y={sy(v)} textAnchor="end" dominantBaseline="central"
            fontSize="8" fill="#8896a8">{Number(v.toFixed(1))}</text>
        </g>
      ))}
      {/* x labels */}
      {points.map((p, i) => (
        <text key={i} x={sx(i)} y={H - 6} textAnchor="middle" fontSize="8" fill="#8896a8">
          {p.sampleName ? p.sampleName.split(" ")[0] : i + 1}
        </text>
      ))}
      {/* line */}
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
      {/* dots */}
      {points.map((p, i) => (
        <circle key={i} cx={sx(i)} cy={sy(p.y)} r="3" fill={color}/>
      ))}
    </svg>
  );
}

// ── Heatmap ──────────────────────────────────────────────────────────────────
function HeatmapChart({ samples, manualData }: { samples: SampleEntry[]; manualData: DataPoint[] }) {
  const params = PARAMETERS.filter((p) => p !== "Other");
  if (samples.length === 0) {
    return <p className="no-data">No samples yet.</p>;
  }

  function getValue(sampleName: string, param: string): number | null {
    const dp = manualData.find((d) => d.sampleName === sampleName && d.parameter === param);
    return dp ? dp.y : null;
  }

  function cellColor(val: number | null, param: string): string {
    if (val === null) return "#f4f6f8";
    const range = PARAM_RANGES[param];
    if (!range) return "#e8ecf0";
    const pct = Math.max(0, Math.min(1, (val - range.min) / (range.max - range.min)));
    if (pct < 0.5)  return "#4FB1A1";
    if (pct < 0.75) return "#FCC055";
    if (pct < 0.9)  return "#EB8D50";
    return "#DF6E5B";
  }

  // Fills card width, cells scale automatically
  const LABEL_W = 80, HEADER_H = 26, CELL_H = 22, GAP = 3;
  // CELL_W calculated to fill ~600px total width
  const CELL_W = Math.floor((560 - LABEL_W - params.length * GAP) / params.length);
  const totalW = LABEL_W + params.length * (CELL_W + GAP);
  const totalH = HEADER_H + samples.length * (CELL_H + GAP) + 4;

  return (
    <div style={{ width: "100%" }}>
      <svg viewBox={`0 0 ${totalW} ${totalH}`} style={{ width: "100%", display: "block" }}>
        {/* column headers */}
        {params.map((p, pi) => (
          <text key={pi}
            x={LABEL_W + pi * (CELL_W + GAP) + CELL_W / 2} y={HEADER_H - 7}
            textAnchor="middle" fontSize="8" fontWeight="600" fill="#94a3b8">
            {p.split(" ")[0].slice(0, 4).toUpperCase()}
          </text>
        ))}
        {/* rows */}
        {samples.map((s, si) => {
          const ry = HEADER_H + si * (CELL_H + GAP);
          return (
            <g key={si}>
              <text x={LABEL_W - 5} y={ry + CELL_H / 2}
                textAnchor="end" dominantBaseline="central"
                fontSize="9" fontWeight="600" fill="#334155">
                {s.sampleName.length > 9 ? s.sampleName.slice(0, 9) + "…" : s.sampleName}
              </text>
              {params.map((p, pi) => {
                const val = getValue(s.sampleName, p);
                const bg  = cellColor(val, p);
                const cx2 = LABEL_W + pi * (CELL_W + GAP);
                const tc  = val === null ? "#c0cad4" : "#fff";
                return (
                  <g key={pi}>
                    <rect x={cx2} y={ry} width={CELL_W} height={CELL_H} rx="3" fill={bg}/>
                    <text x={cx2 + CELL_W / 2} y={ry + CELL_H / 2}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize="8.5" fontWeight="700" fill={tc}>
                      {val === null ? "—" : Number(val.toFixed(1))}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
type AnomalyMsg = { severity: "critical" | "warning" | "info"; parameter: string; sample: string; message: string };

export default function ProjectDataPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const projectId = decodeURIComponent(id || "");

  const [activeTab, setActiveTab] = useState<PageTab>("data");

  // Backend project data
  const [project,    setProject]    = useState<BackendProject | null>(null);
  const [readings,   setReadings]   = useState<BackendReading[]>([]);
  const [dosingJobs, setDosingJobs] = useState<DosingJob[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [notFound,   setNotFound]   = useState(false);

  // Modal state
  const [modalOpen,  setModalOpen]  = useState(false);
  const [modalPhase, setModalPhase] = useState<ModalPhase>("new-sample");
  const [currentSampleIndex, setCurrentSampleIndex] = useState(0);
  const [pendingEntries,     setPendingEntries]     = useState<DataPoint[]>([]);
  const [mParameter, setMParameter] = useState(PARAMETERS[0]);
  const [mValue,     setMValue]     = useState("");
  const [mError,     setMError]     = useState("");
  const [newSampleName, setNewSampleName] = useState("");
  const [newRegion,     setNewRegion]     = useState("");
  const [newParam,      setNewParam]      = useState(PARAMETERS[0]);
  const [newValue,      setNewValue]      = useState("");
  const [newError,      setNewError]      = useState("");
  const [selectedSample, setSelectedSample] = useState<string>("");
  const [confirmDeleteSample, setConfirmDeleteSample] = useState<string | null>(null);
  const [projectStatus, setProjectStatus] = useState<"idle" | "active">("idle");
  const [statusLoading, setStatusLoading] = useState(false);

  // Edit sample modal
  const [editSampleModal, setEditSampleModal] = useState<{id: string; name: string; region: string} | null>(null);
  const [editSampleName, setEditSampleName] = useState("");
  const [editSampleRegion, setEditSampleRegion] = useState("");
  const [editSampleError, setEditSampleError] = useState("");

  // Dosing job view modal
  const [viewJobModal, setViewJobModal] = useState<DosingJob | null>(null);
  const [editJobVolume, setEditJobVolume] = useState("");

  // Reading edit/delete modals
  const [editReadingModal, setEditReadingModal] = useState<BackendReading | null>(null);
  const [deleteReadingModal, setDeleteReadingModal] = useState<BackendReading | null>(null);
  const [readingModalError, setReadingModalError] = useState("");

  // Global camera IP
  const [cameraIp, setCameraIp] = useState("");

  useEffect(() => {
    fetch(`${API}/system/settings`)
      .then(r => r.ok ? r.json() : {} as { camera_ip?: string })
      .then((d: { camera_ip?: string }) => { if (d.camera_ip) setCameraIp(d.camera_ip); })
      .catch(() => {});
  }, []);

  // ── Anomaly detection ─────────────────────────────────────────────────────
  const [anomalies,     setAnomalies]     = useState<AnomalyMsg[]>([]);
  const [anomalyLoading,setAnomalyLoading]= useState(false);

  useEffect(() => {
    if (!projectId || !project) return;
    setAnomalyLoading(true);
    fetch(`${API}/anomaly/${projectId}`, {
      headers: { Authorization: `Bearer ${token()}` }
    })
    .then(r => r.ok ? r.json() : [])
    .then(setAnomalies)
    .catch(() => {})
    .finally(() => setAnomalyLoading(false));
  }, [projectId, readings]);

  // ── Fetch project + readings from backend ──────────────────────────────────
  const [loadError, setLoadError] = useState("");

  const loadData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setLoadError("");
    try {
      let proj: BackendProject | null = null;

      const msRes = await fetch(`${API}/multisensor/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token()}` }
      });
      if (msRes.ok) {
        proj = await msRes.json();
      } else if (msRes.status !== 404) {
        setLoadError("Could not load project — server error.");
      } else {
        const dosRes = await fetch(`${API}/dosing/projects/${projectId}`, {
          headers: { Authorization: `Bearer ${token()}` }
        });
        if (dosRes.ok) { proj = await dosRes.json(); }
        else if (dosRes.status === 404) { setNotFound(true); setLoading(false); return; }
        else setLoadError("Could not load project — server error.");
      }

      if (!proj) { setNotFound(true); setLoading(false); return; }
      setProject(proj);
      setProjectStatus((proj.status as "idle" | "active") || "idle");

      // Fetch paginated readings (up to 500 at a time) — works for both multisensor and dosing
      const allReadings: BackendReading[] = [];
      let page = 1;
      while (true) {
        const rRes = await fetch(`${API}/multisensor/${projectId}/readings?page=${page}&per_page=500`, {
          headers: { Authorization: `Bearer ${token()}` }
        });
        if (!rRes.ok) break;
        const data = await rRes.json();
        allReadings.push(...data.items);
        if (allReadings.length >= data.total || data.items.length === 0) break;
        page++;
      }
      setReadings(allReadings);

      // Fetch dosing jobs if dosing project
      if (proj.system_type === "dosing") {
        const jRes = await fetch(`${API}/dosing/${projectId}/jobs?per_page=200`, {
          headers: { Authorization: `Bearer ${token()}` }
        });
        if (jRes.ok) {
          const jData = await jRes.json();
          setDosingJobs(jData.items || []);
        }
      }
    } catch {
      setLoadError("Could not connect to server. Make sure the backend is running.");
    }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Convert backend readings to DataPoints for charts ─────────────────────
  const manualData: DataPoint[] = useMemo(() => {
    return readings.map((r, i) => {
      const sample = project?.samples.find(s => s.id === r.sample_id);
      return {
        x: i + 1,
        y: r.value,
        sampleName: sample?.sample_name || "Unknown",
        region:     sample?.region || "",
        parameter:  r.parameter,
      };
    });
  }, [readings, project]);

  // Samples from project
  const multiSamples: SampleEntry[] = useMemo(() =>
    (project?.samples || []).map(s => ({ id: s.id, sampleName: s.sample_name, region: s.region })),
    [project]
  );

  // ── Save manual reading to backend ────────────────────────────────────────
  async function saveReadingToBackend(entry: DataPoint) {
    let sampleId: string | null =
      project?.samples.find(s => s.sample_name === entry.sampleName)?.id || null;

    if (!sampleId && entry.sampleName && entry.sampleName !== "Unknown") {
      try {
        const sRes = await fetch(`${API}/multisensor/${projectId}/samples`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
          body: JSON.stringify({ sample_name: entry.sampleName, region: entry.region || "" }),
        });
        if (sRes.ok) {
          const created = await sRes.json();
          sampleId = created.id;
        } else {
          const err = await sRes.json().catch(() => ({}));
          console.error("Could not create sample:", sRes.status, err);
        }
      } catch (e) { console.error("Could not create sample", e); }
    }

    try {
      const res = await fetch(`${API}/multisensor/${projectId}/readings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          sample_id: sampleId,
          parameter: entry.parameter,
          value:     entry.y,
          unit:      PARAM_RANGES[entry.parameter || ""]?.unit?.trim() || "",
          source:    "manual",
        }),
      });
      if (res.ok) {
        await loadData();
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("Failed to save reading:", res.status, err);
        alert(`Could not save reading: ${err.detail || res.status}`);
      }
    } catch (e) { console.error("Could not save reading to backend", e); alert("Could not connect to server."); }
  }

  // ── Delete sample from backend ────────────────────────────────────────────
  async function deleteSample(sampleName: string) {
    const sample = project?.samples.find(s => s.sample_name === sampleName);
    if (!sample?.id) return;
    try {
      await fetch(`${API}/multisensor/${projectId}/samples/${sample.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (selectedSample === sampleName) setSelectedSample("");
      setConfirmDeleteSample(null);
      await loadData();
    } catch { alert("Could not delete sample."); }
  }

  // ── Rename sample ─────────────────────────────────────────────────────────
  function openEditSample(sampleName: string) {
    const sample = project?.samples.find(s => s.sample_name === sampleName);
    if (!sample) return;
    setEditSampleModal({ id: sample.id, name: sample.sample_name, region: sample.region });
    setEditSampleName(sample.sample_name);
    setEditSampleRegion(sample.region);
    setEditSampleError("");
  }

  async function submitEditSample(e: React.FormEvent) {
    e.preventDefault();
    if (!editSampleModal) return;
    if (!editSampleName.trim()) { setEditSampleError("Sample name is required."); return; }
    if (editSampleName.trim().length > 18) { setEditSampleError("Max 18 characters."); return; }
    if (editSampleRegion.length > 25) { setEditSampleError("Region max 25 characters."); return; }
    try {
      const res = await fetch(`${API}/multisensor/${projectId}/samples/${editSampleModal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ sample_name: editSampleName.trim(), region: editSampleRegion }),
      });
      if (!res.ok) { setEditSampleError("Could not update sample."); return; }
      if (selectedSample === editSampleModal.name) setSelectedSample(editSampleName.trim());
      setEditSampleModal(null);
      await loadData();
    } catch { setEditSampleError("Could not connect to server."); }
  }

  async function renameSample(sampleName: string) {
    openEditSample(sampleName);
  }

  // ── Export (use backend endpoints) ───────────────────────────────────────
  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("currentUser");
    nav("/signin", { replace: true });
  }

  async function exportData(format: "json" | "csv") {
    if (!project) return;
    const endpoint = project.system_type === "multisensor"
      ? `/exports/${projectId}/${format}`
      : `/exports/${projectId}/${format}`;
    const res = await fetch(`${API}${endpoint}`, {
      headers: { Authorization: `Bearer ${token()}` }
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name.replace(/ /g, "_")}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Modal handlers ────────────────────────────────────────────────────────
  async function toggleCollection() {
    const action = projectStatus === "idle" ? "start" : "stop";
    setStatusLoading(true);
    try {
      const res = await fetch(`${API}/multisensor/${projectId}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (res.ok) {
        setProjectStatus(action === "start" ? "active" : "idle");
      }
    } catch { console.error("Could not update status"); }
    finally { setStatusLoading(false); }
  }

  function openManualModal() {
    setPendingEntries([]); setMParameter(PARAMETERS[0]); setMValue(""); setMError("");
    setNewSampleName(""); setNewRegion(""); setNewParam(PARAMETERS[0]); setNewValue(""); setNewError("");
    if (project?.manual_only && multiSamples.length > 0) {
      setCurrentSampleIndex(0); setModalPhase("preloaded");
    } else {
      setModalPhase("new-sample");
    }
    setModalOpen(true);
  }

  async function submitPreloadedEntry(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mValue.trim() === "" || isNaN(Number(mValue))) { setMError("Please enter a valid numeric value."); return; }
    const sample = multiSamples[currentSampleIndex];
    const entry: DataPoint = { x: readings.length + pendingEntries.length + 1, y: Number(mValue), sampleName: sample.sampleName, region: sample.region, parameter: mParameter };
    const newPending = [...pendingEntries, entry];
    setPendingEntries(newPending);
    const isLast = currentSampleIndex >= multiSamples.length - 1;
    if (!isLast) {
      setCurrentSampleIndex(currentSampleIndex + 1); setMParameter(PARAMETERS[0]); setMValue(""); setMError("");
    } else {
      for (const e2 of newPending) await saveReadingToBackend(e2);
      setPendingEntries([]);
      goToNewSamplePhase();
    }
  }

  function skipPreloadedSample() {
    const isLast = currentSampleIndex >= multiSamples.length - 1;
    if (!isLast) {
      setCurrentSampleIndex(currentSampleIndex + 1); setMParameter(PARAMETERS[0]); setMValue(""); setMError("");
    } else {
      if (pendingEntries.length > 0) {
        Promise.all(pendingEntries.map(e => saveReadingToBackend(e)));
        setPendingEntries([]);
      }
      goToNewSamplePhase();
    }
  }

  function goToNewSamplePhase() {
    setNewSampleName(""); setNewRegion(""); setNewParam(PARAMETERS[0]); setNewValue(""); setNewError("");
    setModalPhase("new-sample");
  }

  function submitNewSampleInfo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newSampleName.trim()) { setNewError("Sample name is required."); return; }
    if (newSampleName.trim().length > 18) { setNewError("Sample name must be 18 characters or fewer."); return; }
    setNewError(""); setModalPhase("new-entry");
  }

  async function submitNewEntry(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (newValue.trim() === "" || isNaN(Number(newValue))) { setNewError("Please enter a valid numeric value."); return; }
    const entry: DataPoint = { x: readings.length + 1, y: Number(newValue), sampleName: newSampleName.trim(), region: newRegion.trim(), parameter: newParam };
    await saveReadingToBackend(entry);
    setNewValue(""); setNewError(""); setNewParam(PARAMETERS[0]); setNewSampleName(""); setNewRegion("");
    setModalPhase("new-sample");
  }

  // ── Loading / not found states ────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--ink-3)" }}>Loading project…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ padding: "2rem" }}>
        <div style={{ background: "var(--danger-subtle)", border: "1px solid var(--danger)", borderRadius: 8, padding: "16px", color: "var(--danger)", marginBottom: 16 }}>
          {loadError}
        </div>
        <button type="button" onClick={() => { setLoadError(""); loadData(); }}>Retry</button>
        <button type="button" onClick={() => nav("/app")} style={{ marginLeft: 8 }}>Back to Dashboard</button>
      </div>
    );
  }

  if (notFound || !project) {
    return (
      <div style={{ padding: "2rem" }}>
        <h2>Project not found</h2>
        <p>This project may have been deleted or you don't have access to it.</p>
        <button type="button" onClick={() => nav("/app")}>Back to Dashboard</button>
      </div>
    );
  }

  // ── Derived data for charts ───────────────────────────────────────────────
  const parameterGroups: Record<string, DataPoint[]> = {};
  for (const p of manualData) {
    const key = p.parameter || "Other";
    if (!parameterGroups[key]) parameterGroups[key] = [];
    parameterGroups[key].push(p);
  }
  const parameterKeys = Object.keys(parameterGroups);

  const manualCountBySample: Record<string, number> = {};
  for (const p of manualData) {
    const key = p.sampleName || "Unknown";
    manualCountBySample[key] = (manualCountBySample[key] || 0) + 1;
  }

  const allKnownSamples: SampleEntry[] = (() => {
    const seen = new Map<string, SampleEntry>();
    for (const s of multiSamples) seen.set(s.sampleName, s);
    for (const p of manualData) {
      if (p.sampleName && p.sampleName !== "Unknown" && !seen.has(p.sampleName))
        seen.set(p.sampleName, { sampleName: p.sampleName, region: p.region || "" });
    }
    return Array.from(seen.values());
  })();

  const activeSample   = selectedSample || allKnownSamples[0]?.sampleName || "";
  const activeSampleData = manualData.filter(d => d.sampleName === activeSample);
  const gaugeParams    = Object.keys(PARAM_RANGES).filter(p => activeSampleData.some(d => d.parameter === p));


  function scoreForSample(sampleName: string): number {
    const points = manualData.filter(p => p.sampleName === sampleName);
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

  function qualityLabel(score: number): string {
    if (score >= 85) return "Excellent";
    if (score >= 70) return "Good";
    if (score >= 50) return "Fair";
    if (score >  0)  return "Poor";
    return "No data";
  }

  function qualityColor(score: number): string {
    if (score >= 85) return "#4FB1A1";
    if (score >= 70) return "#84cc16";
    if (score >= 50) return "#f59e0b";
    if (score >  0)  return "#DF6E5B";
    return "#94a3b8";
  }

  const sampleScores = allKnownSamples
    .map(s => ({ ...s, score: scoreForSample(s.sampleName) }))
    .sort((a, b) => b.score - a.score);

  const isLastPreloaded = currentSampleIndex >= multiSamples.length - 1;
  const currentSample   = multiSamples[currentSampleIndex];

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
            if ((role === "admin" || role === "researcher") && project?.owner_username) {
              nav(`/user/${encodeURIComponent(project.owner_username)}`);
            } else {
              nav("/profile");
            }
          }}>← Profile</button>
          <h1 className="topbar-project-name">{project.name}</h1>
          <span className={`card-type-badge ${project.system_type}`} style={{ fontSize: 11 }}>
            {project.system_type === "multisensor" ? "MultiSensor" : "Dosing"}
          </span>
        </div>
        <div className="export-actions">
          <button type="button" onClick={() => loadData()}>↻ Refresh</button>
          <button type="button" onClick={() => exportData("json")}>Export JSON</button>
          <button type="button" onClick={() => exportData("csv")}>Export CSV</button>
          <button className="logout-btn" type="button" onClick={logout}>Logout</button>
        </div>
      </header>

      <div className="project-layout">
        <aside className="project-sidebar">
          <button
            type="button"
            onClick={toggleCollection}
            disabled={statusLoading}
            style={{
              background: projectStatus === "active" ? "#DF6E5B" : "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              fontWeight: 600,
              cursor: "pointer",
              marginBottom: 6,
              width: "100%",
            }}
          >
            {statusLoading ? "…" : projectStatus === "active" ? "⏹ Stop collection" : "▶ Start collection"}
          </button>
          <button type="button" onClick={openManualModal}>Add manual data</button>

          <div className="project-info-panel">
            <div className="system-badge">
              {project.system_type === "dosing" ? "Dosing System" : "MultiSensor System"}
            </div>

            {/* Live camera feed — shared device */}
            {project.system_type === "dosing" && (
              <div style={{ marginTop: 10 }}>
                <div className="info-section-title">ESP-CAM Live Feed</div>
                {cameraIp && projectStatus === "active" ? (
                  <div style={{ marginTop: 6 }}>
                    <img
                      src={`http://${cameraIp}/stream`}
                      alt="Live feed"
                      style={{ width: "100%", borderRadius: 8, border: "1px solid var(--line)" }}
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4, textAlign: "center" }}>
                      Live — {cameraIp}
                    </p>
                  </div>
                ) : (
                  <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>
                    {cameraIp ? "Start collection to see live feed" : "Camera IP not configured"}
                  </p>
                )}
              </div>
            )}

            {project.system_type === "dosing" && (
              <>
                <div className="info-section-title">
                  {project.samples.length} Source{project.samples.length !== 1 ? "s" : ""}
                </div>
                <ul className="info-list">
                  {project.samples.map((s, i) => {
                    const job = dosingJobs.find(j => j.source_name === s.sample_name);
                    return (
                      <li key={i} className="info-sample-item">
                        <div className="info-sample-header">
                          <span className="info-list-index">#{i + 1}</span>
                          <span className="info-sample-name">{s.sample_name || "—"}</span>
                        </div>
                        <div className="info-sample-region">{s.region || "—"}</div>
                        {job?.volume_ml != null && (
                          <div className="info-sample-count">{job.volume_ml.toFixed(2)} mL</div>
                        )}
                        <div className="info-sample-actions" onClick={e => e.stopPropagation()}>
                          {job && (
                            <button type="button" className="icon-btn"
                              title="View capture"
                              onClick={() => { setViewJobModal(job); setEditJobVolume(String(job.volume_ml ?? "")); }}>
                              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                                <circle cx="12" cy="13" r="4"/>
                              </svg>
                            </button>
                          )}
                          <button type="button" className="icon-btn rename-btn"
                            title={`Rename ${s.sample_name}`}
                            onClick={() => renameSample(s.sample_name)}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>
                          <button type="button" className="icon-btn delete-btn"
                            title={`Delete ${s.sample_name}`}
                            onClick={() => setConfirmDeleteSample(s.sample_name)}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                              <path d="M10 11v6"/><path d="M14 11v6"/>
                              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                            </svg>
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {project.system_type === "multisensor" && (
              <>
                <div className="info-section-title">
                  {allKnownSamples.length} Sample{allKnownSamples.length !== 1 ? "s" : ""}
                </div>
                <ul className="info-list">
                  {allKnownSamples.map((s, i) => {
                    const count = manualCountBySample[s.sampleName] || 0;
                    return (
                      <li key={i} className="info-sample-item">
                        <div className="info-sample-header">
                          <span className="info-list-index">#{i + 1}</span>
                          <span className="info-sample-name">{s.sampleName || "—"}</span>
                        </div>
                        <div className="info-sample-region">{s.region || "—"}</div>
                        {count > 0 && (
                          <div className="info-sample-count">
                            {count} manual entr{count === 1 ? "y" : "ies"}
                          </div>
                        )}
                        <div className="info-sample-actions">
                          <button type="button" className="icon-btn rename-btn"
                            title={`Rename ${s.sampleName}`}
                            onClick={() => renameSample(s.sampleName)}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>
                          <button type="button" className="icon-btn delete-btn"
                            title={`Delete ${s.sampleName}`}
                            onClick={() => setConfirmDeleteSample(s.sampleName)}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                              <path d="M10 11v6"/><path d="M14 11v6"/>
                              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                            </svg>
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>

          {/* ── ANOMALY DETECTION PANEL ── */}
          <div className="anomaly-panel">
            <div className="anomaly-panel-header">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              Anomaly detection
            </div>
            {anomalyLoading ? (
              <p className="anomaly-loading">Analysing…</p>
            ) : anomalies.length === 0 ? (
              <p className="anomaly-ok">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                All readings within normal range
              </p>
            ) : (
              <ul className="anomaly-list">
                {anomalies.map((a, i) => (
                  <li key={i} className={`anomaly-item anomaly-${a.severity}`}>
                    <span className="anomaly-dot" />
                    <span className="anomaly-text">{a.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <main className="project-main-full">

          {/* ── TAB BAR ── */}
          <div className="page-tab-bar">
            <button
              type="button"
              className={`page-tab${activeTab === "data" ? " active" : ""}`}
              onClick={() => setActiveTab("data")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
                <line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
              Data
            </button>
            <button
              type="button"
              className={`page-tab${activeTab === "charts" ? " active" : ""}`}
              onClick={() => setActiveTab("charts")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              Charts
            </button>
          </div>

          {/* ══════════════ DATA TAB ══════════════ */}
          {activeTab === "data" && (
            <div className="project-main">

              {/* Dosing jobs section */}
              {project.system_type === "dosing" && dosingJobs.length > 0 && (
                <div className="graph-card" style={{ gridColumn: "1 / -1" }}>
                  <h2>Dosing captures</h2>
                  {dosingJobs.length === 0 ? (
                    <p className="no-data">No captures yet. Start collection and the ESP-CAM will send images automatically.</p>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, marginTop: 8 }}>
                      {dosingJobs.map(job => (
                        <div key={job.id} className="info-sample-item" style={{ cursor: "pointer", padding: 12 }}
                          onClick={() => { setViewJobModal(job); setEditJobVolume(String(job.volume_ml ?? "")); }}>
                          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{job.source_name}</div>
                          <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 8 }}>{job.liquid}</div>
                          {job.image_path && (
                            <img src={`${API}/uploads/${job.image_path.split(/[\\/]/).pop()}`}
                              alt="before" style={{ width: "100%", borderRadius: 6, objectFit: "cover", height: 100 }} />
                          )}
                          <div style={{ marginTop: 8, fontSize: 12 }}>
                            <span style={{ fontWeight: 600, color: "var(--accent)" }}>
                              {job.volume_ml != null ? `${job.volume_ml.toFixed(2)} mL` : "Processing…"}
                            </span>
                            {job.moles != null && <span style={{ color: "var(--ink-3)", marginLeft: 8 }}>{job.moles.toFixed(4)} mol</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="graph-card" style={{ gridColumn: "1 / -1" }}>
                <h2>Device readings</h2>
                {readings.filter(r => r.source === "device").length === 0 ? (
                  <p className="no-data">No device readings yet. Connect your ESP32 and it will push data automatically.</p>
                ) : (
                  <div className="bar-chart">
                    {readings.filter(r => r.source === "device").map((r, ri) => (
                      <div key={r.id} className="bar-col">
                        <span className="bar-label">{r.value}</span>
                        <div className="bar" style={{ height: `${Math.min((r.value / 100) * 100, 100)}%` }} />
                        <span className="bar-x">{r.parameter?.split(" ")[0] ?? ri + 1}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {manualData.length === 0 ? (
                <div className="graph-card" style={{ gridColumn: "1 / -1" }}>
                  <h2>Manual data</h2>
                  <p className="no-data">No data yet. Click "Add manual data".</p>
                </div>
              ) : (
                parameterKeys.map((param) => {
                  const points = parameterGroups[param];
                  const maxY   = Math.max(...points.map((p) => Math.abs(p.y)), 1);
                  const color  = PARAM_COLORS[param] ?? "#2f86c7";
                  const MAX_BAR_PX = 160;
                  return (
                    <div key={param} className="graph-card">
                      <div className="chart-header">
                        <span className="chart-param-dot" style={{ background: color }} />
                        <h2>{param}</h2>
                      </div>
                      <div className="bar-chart">
                        {points.map((point, i) => (
                          <div key={i} className="bar-col" title={`${point.sampleName} (${point.region}): ${point.y}`}>
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
                {allKnownSamples.length <= 1 ? (
                  <>
                    <div className="quality-bar">
                      <div className="quality-fill" style={{ width: `${Math.min(sampleScores[0]?.score ?? 0, 100)}%` }} />
                    </div>
                    <p>Quality score: {sampleScores[0]?.score ?? 0}/100</p>
                  </>
                ) : (
                  <table className="quality-table">
                    <thead>
                      <tr>
                        <th>Rank</th><th>Sample</th><th>Region</th>
                        <th>Score</th><th>Quality</th><th style={{ width: "40%" }}>Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sampleScores.map((s, i) => (
                        <tr key={s.sampleName}>
                          <td className="quality-rank">
                            {i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "3rd" : `${i + 1}th`}
                          </td>
                          <td style={{ fontWeight: 600 }}>{s.sampleName}</td>
                          <td style={{ color: "var(--ink-3)", fontSize: 13 }}>{s.region}</td>
                          <td style={{ fontWeight: 700, color: qualityColor(s.score) }}>
                            {s.score > 0 ? `${s.score}/100` : "—"}
                          </td>
                          <td>
                            <span className="quality-badge" style={{ background: qualityColor(s.score) }}>
                              {qualityLabel(s.score)}
                            </span>
                          </td>
                          <td>
                            <div className="quality-bar quality-bar-sm">
                              <div className="quality-fill" style={{ width: `${s.score}%`, background: qualityColor(s.score) }} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Readings table with edit/delete */}
              {readings.filter(r => r.source === "manual").length > 0 && (
                <div className="graph-card" style={{ gridColumn: "1 / -1" }}>
                  <h2>All manual readings</h2>
                  <table className="quality-table">
                    <thead>
                      <tr><th>Sample</th><th>Parameter</th><th>Value</th><th>Unit</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                      {readings.filter(r => r.source === "manual").map(r => {
                        const sample = project.samples.find(s => s.id === r.sample_id);
                        return (
                          <tr key={r.id}>
                            <td>{sample?.sample_name || "—"}</td>
                            <td>{r.parameter}</td>
                            <td style={{ fontWeight: 600 }}>{r.value}</td>
                            <td style={{ color: "var(--ink-3)" }}>{r.unit || "—"}</td>
                            <td>
                              <div className="db-table-actions">
                                <button type="button" className="icon-btn rename-btn" title="Edit value"
                                  onClick={() => { setReadingModalError(""); setEditReadingModal(r); }}>
                                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                  </svg>
                                </button>
                                <button type="button" className="icon-btn delete-btn" title="Delete reading"
                                  onClick={() => setDeleteReadingModal(r)}>
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
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ══════════════ CHARTS TAB ══════════════ */}
          {activeTab === "charts" && (
            <div className="charts-tab">

              {manualData.length === 0 ? (
                <div className="graph-card charts-empty">
                  <p className="no-data">Add manual data first to see charts.</p>
                </div>
              ) : (
                <>
                  {/* Sample selector (for radar + gauge) */}
                  {allKnownSamples.length > 1 && (
                    <div className="chart-sample-selector">
                      <span className="chart-sample-label">Sample view:</span>
                      {allKnownSamples.map((s) => (
                        <button
                          key={s.sampleName}
                          type="button"
                          className={`chart-sample-btn${activeSample === s.sampleName ? " active" : ""}`}
                          onClick={() => setSelectedSample(s.sampleName)}
                        >
                          {s.sampleName}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* ── Row 1: Radar + Gauges ── */}
                  <div className="charts-row">
                    <div className="graph-card charts-radar-card">
                      <h2>Parameter radar — {activeSample}</h2>
                      <p className="chart-subtitle">Shape shows relative parameter levels (normalized to scale)</p>
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <RadarChart sampleName={activeSample} data={activeSampleData} />
                      </div>
                    </div>

                    <div className="graph-card charts-gauge-card">
                      <h2>Live gauges — {activeSample}</h2>
                      <p className="chart-subtitle">Green arc = safe range · Red = out of range</p>
                      {gaugeParams.length === 0 ? (
                        <p className="no-data">No recognized parameters for gauges.</p>
                      ) : (
                        <div className="gauge-grid">
                          {gaugeParams.map((param) => {
                            const dp = activeSampleData.filter((d) => d.parameter === param);
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

                  {/* ── Row 2: Line charts per parameter ── */}
                  <div className="graph-card" style={{ gridColumn: "1 / -1" }}>
                    <h2>Trends — all samples over time</h2>
                    <p className="chart-subtitle">Each line shows how a parameter value changes across samples</p>
                    <div className="line-charts-grid">
                      {parameterKeys.map((param) => {
                        const points = parameterGroups[param];
                        const color  = PARAM_COLORS[param] ?? "#2f86c7";
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

                  {/* ── Row 3: Heatmap ── */}
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

      {/* MODAL */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>

            {modalPhase === "preloaded" && currentSample && (
              <>
                <div className="step-indicator">Sample {currentSampleIndex + 1} of {multiSamples.length}</div>
                <h3>Add manual data</h3>
                <div className="manual-sample-info">
                  <div className="info-row"><span className="info-label">Sample</span><span className="info-value">{currentSample.sampleName}</span></div>
                  <div className="info-row"><span className="info-label">Region</span><span className="info-value">{currentSample.region}</span></div>
                </div>
                <form onSubmit={submitPreloadedEntry}>
                  <label htmlFor="m-parameter">Parameter</label>
                  <select id="m-parameter" value={mParameter} className="modal-select" onChange={(e) => setMParameter(e.target.value)}>
                    {PARAMETERS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <label htmlFor="m-value">Value</label>
                  <input id="m-value" type="number" step="any" value={mValue} required placeholder="Enter measured value" autoFocus
                    onChange={(e) => { setMValue(e.target.value); setMError(""); }} />
                  {mError && <p className="form-error">{mError}</p>}
                  <div className="modal-actions-column">
                    <div className="modal-actions-row">
                      <button type="submit">{isLastPreloaded ? "Save & add new sample" : "Next sample →"}</button>
                      <button type="button" className="btn-secondary" onClick={skipPreloadedSample}>{isLastPreloaded ? "Skip & add new sample" : "Skip"}</button>
                    </div>
                    <div className="modal-actions-row">
                      <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
                    </div>
                  </div>
                </form>
              </>
            )}

            {modalPhase === "new-sample" && (
              <>
                <h3>Add new sample</h3>
                <p style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 12 }}>Enter the details for a new sample to record data for.</p>
                <form onSubmit={submitNewSampleInfo}>
                  <label htmlFor="new-sample-name">Sample name</label>
                  <input id="new-sample-name" value={newSampleName} required placeholder="e.g. Lake B" autoFocus maxLength={18}
                    onChange={(e) => { setNewSampleName(e.target.value); setNewError(""); }} />
                  <label htmlFor="new-region">Region</label>
                  <input id="new-region" value={newRegion} placeholder="e.g. North Zone" maxLength={25} onChange={(e) => setNewRegion(e.target.value)} />
                  {newError && <p className="form-error">{newError}</p>}
                  <div className="modal-actions-column">
                    <div className="modal-actions-row"><button type="submit">Next →</button></div>
                    <div className="modal-actions-row">
                      <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>Done — close</button>
                    </div>
                  </div>
                </form>
              </>
            )}

            {modalPhase === "new-entry" && (
              <>
                <h3>Record data</h3>
                <div className="manual-sample-info">
                  <div className="info-row"><span className="info-label">Sample</span><span className="info-value">{newSampleName}</span></div>
                  {newRegion && <div className="info-row"><span className="info-label">Region</span><span className="info-value">{newRegion}</span></div>}
                </div>
                <form onSubmit={submitNewEntry}>
                  <label htmlFor="new-param">Parameter</label>
                  <select id="new-param" value={newParam} className="modal-select" onChange={(e) => setNewParam(e.target.value)}>
                    {PARAMETERS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <label htmlFor="new-val">Value</label>
                  <input id="new-val" type="number" step="any" value={newValue} required placeholder="Enter measured value" autoFocus
                    onChange={(e) => { setNewValue(e.target.value); setNewError(""); }} />
                  {newError && <p className="form-error">{newError}</p>}
                  <div className="modal-actions-column">
                    <div className="modal-actions-row"><button type="submit">Save & add another sample</button></div>
                    <div className="modal-actions-row">
                      <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>Done — close</button>
                    </div>
                  </div>
                </form>
              </>
            )}

          </div>
        </div>
      )}
      {/* ── VIEW DOSING JOB MODAL ── */}
      {viewJobModal && (
        <div className="modal-overlay" onClick={() => setViewJobModal(null)}>
          <div className="modal modal-large" onClick={e => e.stopPropagation()}>
            <h3>{viewJobModal.source_name} — {viewJobModal.liquid}</h3>

            {/* Before / After images */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, margin: "16px 0" }}>
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 6, textAlign: "center" }}>BEFORE</p>
                {viewJobModal.image_path ? (
                  <img src={`${API}/uploads/${viewJobModal.image_path.split(/[\\/]/).pop()}`}
                    alt="before" style={{ width: "100%", borderRadius: 8, objectFit: "contain", maxHeight: 260 }} />
                ) : <p className="no-data">No image</p>}
              </div>
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 6, textAlign: "center" }}>AFTER</p>
                {viewJobModal.image_path_after ? (
                  <img src={`${API}/uploads/${viewJobModal.image_path_after.split(/[\\/]/).pop()}`}
                    alt="after" style={{ width: "100%", borderRadius: 8, objectFit: "contain", maxHeight: 260 }} />
                ) : <p className="no-data">No after image yet</p>}
              </div>
            </div>

            {/* Editable values */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)" }}>Volume dispensed (mL)</label>
                <input type="number" step="0.001" value={editJobVolume}
                  onChange={e => setEditJobVolume(e.target.value)}
                  style={{ width: "100%", marginTop: 4 }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  Moles: <strong>{viewJobModal.moles != null ? viewJobModal.moles.toFixed(6) : "—"}</strong>
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  Concentration: <strong>{viewJobModal.concentration != null ? viewJobModal.concentration : "—"}</strong>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button type="button" onClick={async () => {
                const vol = parseFloat(editJobVolume);
                if (isNaN(vol)) { alert("Enter a valid volume."); return; }
                const res = await fetch(`${API}/dosing/${projectId}/jobs/${viewJobModal.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
                  body: JSON.stringify({ volume_ml: vol }),
                });
                if (res.ok) {
                  const updated: DosingJob = await res.json();
                  setDosingJobs(prev => prev.map(j => j.id === updated.id ? updated : j));
                  setViewJobModal(updated);
                } else alert("Could not update.");
              }}>Save volume</button>
              <button type="button" onClick={() => setViewJobModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRM DELETE SAMPLE MODAL ── */}
      {confirmDeleteSample && (
        <div className="modal-overlay" onClick={() => setConfirmDeleteSample(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete sample</h3>
            <p style={{ textAlign: "center", color: "var(--ink-2)", fontSize: 13, margin: "0 0 20px" }}>
              Delete <strong>{confirmDeleteSample}</strong>?<br/>
              <span style={{ color: "var(--ink-3)", fontSize: 12 }}>
                This will remove the sample and all its manual data entries. This cannot be undone.
              </span>
            </p>
            <div className="modal-actions">
              <button type="button" style={{ background: "var(--danger)", borderColor: "var(--danger)" }}
                onClick={() => deleteSample(confirmDeleteSample)}>
                Yes, delete sample
              </button>
              <button type="button" onClick={() => setConfirmDeleteSample(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT SAMPLE MODAL ── */}
      {editSampleModal && (
        <div className="modal-overlay" onClick={() => setEditSampleModal(null)}>
          <div className="modal modal-large" onClick={e => e.stopPropagation()}>
            <h3>Edit sample</h3>
            <form onSubmit={submitEditSample}>
              <label htmlFor="edit-sample-name">Sample name</label>
              <input id="edit-sample-name" type="text" value={editSampleName} required maxLength={18} autoFocus
                onChange={e => { setEditSampleName(e.target.value); setEditSampleError(""); }} />
              <label htmlFor="edit-sample-region">Region</label>
              <input id="edit-sample-region" type="text" value={editSampleRegion} maxLength={25}
                placeholder="e.g. North Zone"
                onChange={e => { setEditSampleRegion(e.target.value); setEditSampleError(""); }} />
              {editSampleError && <p className="form-error">{editSampleError}</p>}
              <div className="modal-actions" style={{ marginTop: 16 }}>
                <button type="submit">Save name & region</button>
                <button type="button" onClick={() => setEditSampleModal(null)}>Cancel</button>
              </div>
            </form>

            {/* Readings for this sample */}
            {(() => {
              const sampleReadings = readings.filter(r => r.sample_id === editSampleModal.id && r.source === "manual");
              if (sampleReadings.length === 0) return <p className="no-data" style={{ marginTop: 16 }}>No manual readings for this sample.</p>;
              return (
                <div style={{ marginTop: 20 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)", marginBottom: 8 }}>Readings</p>
                  <table className="quality-table">
                    <thead><tr><th>Parameter</th><th>Value</th><th>Actions</th></tr></thead>
                    <tbody>
                      {sampleReadings.map(r => (
                        <tr key={r.id}>
                          <td>
                            <select defaultValue={r.parameter} id={`param-${r.id}`}
                              className="modal-select" style={{ fontSize: 12, padding: "4px 8px" }}>
                              {PARAMETERS.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                          </td>
                          <td>
                            <input id={`val-${r.id}`} type="number" step="any"
                              defaultValue={r.value}
                              style={{ width: 80, fontSize: 12, padding: "4px 8px" }} />
                          </td>
                          <td>
                            <div className="db-table-actions">
                              <button type="button" className="icon-btn rename-btn" title="Save"
                                onClick={async () => {
                                  const paramEl = document.getElementById(`param-${r.id}`) as HTMLSelectElement;
                                  const valEl   = document.getElementById(`val-${r.id}`)   as HTMLInputElement;
                                  const newVal  = Number(valEl.value);
                                  if (isNaN(newVal)) return;
                                  const res = await fetch(`${API}/multisensor/${projectId}/readings/${r.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
                                    body: JSON.stringify({ parameter: paramEl.value, value: newVal, unit: r.unit, source: r.source, sample_id: r.sample_id }),
                                  });
                                  if (res.ok) await loadData();
                                  else alert("Could not update reading.");
                                }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12"/>
                                </svg>
                              </button>
                              <button type="button" className="icon-btn delete-btn" title="Delete"
                                onClick={async () => {
                                  setDeleteReadingModal(r);
                                }}>
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
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── EDIT READING MODAL ── */}
      {editReadingModal && (
        <EditModal
          title="Edit reading"
          fields={[
            { id: "parameter", label: "Parameter", defaultValue: editReadingModal.parameter },
            { id: "value", label: "Value", type: "number", defaultValue: String(editReadingModal.value) },
          ]}
          error={readingModalError}
          onClose={() => { setEditReadingModal(null); setReadingModalError(""); }}
          onSave={async v => {
            const val = Number(v.value);
            if (isNaN(val)) { setReadingModalError("Enter a valid number."); return; }
            const res = await fetch(`${API}/multisensor/${projectId}/readings/${editReadingModal.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
              body: JSON.stringify({ parameter: v.parameter, value: val, unit: editReadingModal.unit, source: editReadingModal.source, sample_id: editReadingModal.sample_id }),
            });
            if (res.ok) { setEditReadingModal(null); await loadData(); }
            else setReadingModalError("Could not update reading.");
          }}
        />
      )}

      {/* ── DELETE READING MODAL ── */}
      {deleteReadingModal && (
        <ConfirmModal
          title="Delete reading"
          message={<>Delete the <strong>{deleteReadingModal.parameter}</strong> reading ({deleteReadingModal.value})? This cannot be undone.</>}
          confirmLabel="Yes, delete"
          danger
          onClose={() => setDeleteReadingModal(null)}
          onConfirm={async () => {
            const res = await fetch(`${API}/multisensor/${projectId}/readings/${deleteReadingModal.id}`, {
              method: "DELETE", headers: { Authorization: `Bearer ${token()}` },
            });
            setDeleteReadingModal(null);
            if (res.ok) await loadData();
          }}
        />
      )}
    </div>
  );
}