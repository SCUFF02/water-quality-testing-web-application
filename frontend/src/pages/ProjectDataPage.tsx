import { useMemo, useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";

type DataPoint = {
  x: number;
  y: number;
  sampleName?: string;
  region?: string;
  parameter?: string;
};

type SampleEntry = {
  sampleName: string;
  region: string;
};

type SavedProject = {
  userId: string;
  projectName: string;
  systemType: "multisensor" | "dosing" | "merged";
  timestamp: string;
  formData: Record<string, unknown>;
  manualData: DataPoint[];
  collectedData: DataPoint[];
};

type ModalPhase = "preloaded" | "new-sample" | "new-entry";
type PageTab = "data" | "charts";

const PARAMETERS = [
  "pH", "Turbidity (NTU)", "TDS (ppm)", "Temperature (C)",
  "Conductivity", "Dissolved Oxygen", "Other",
];

const PARAM_COLORS: Record<string, string> = {
  "pH":               "#2f86c7",
  "Turbidity (NTU)":  "#8b5cf6",
  "TDS (ppm)":        "#10b981",
  "Temperature (C)":  "#f59e0b",
  "Conductivity":     "#ef4444",
  "Dissolved Oxygen": "#06b6d4",
  "Other":            "#6366f1",
};

// WHO / standard safe ranges for gauge zones
const PARAM_RANGES: Record<string, { min: number; max: number; safeMin: number; safeMax: number; unit: string }> = {
  "pH":               { min: 0,    max: 14,   safeMin: 6.5,  safeMax: 8.5,  unit: "" },
  "Turbidity (NTU)":  { min: 0,    max: 20,   safeMin: 0,    safeMax: 5,    unit: " NTU" },
  "TDS (ppm)":        { min: 0,    max: 1000, safeMin: 0,    safeMax: 500,  unit: " ppm" },
  "Temperature (C)":  { min: 0,    max: 50,   safeMin: 0,    safeMax: 35,   unit: "°C" },
  "Conductivity":     { min: 0,    max: 2000, safeMin: 0,    safeMax: 1000, unit: " µS" },
  "Dissolved Oxygen": { min: 0,    max: 15,   safeMin: 6,    safeMax: 15,   unit: " mg/L" },
};

// ── Gauge chart (SVG arc) ────────────────────────────────────────────────────
function GaugeChart({ param, value }: { param: string; value: number }) {
  const range = PARAM_RANGES[param];
  if (!range) return null;
  const { min, max, safeMin, safeMax, unit } = range;

  // Clamp value to range
  const pct         = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const safePctMin  = Math.max(0, Math.min(1, (safeMin - min) / (max - min)));
  const safePctMax  = Math.max(0, Math.min(1, (safeMax - min) / (max - min)));
  const inSafe      = value >= safeMin && value <= safeMax;

  // ViewBox: 200 wide, 130 tall
  // Semicircle center at (100, 105), radius 72
  // Arc sweeps from 180° (left) to 0° (right) — left-to-right across top half
  const W = 200, cx = 100, cy = 105, r = 72;

  function ptOnArc(fraction: number) {
    // fraction 0 = leftmost (180°), 1 = rightmost (0°)
    const angle = Math.PI * (1 - fraction); // 180° down to 0°
    return {
      x: cx + r * Math.cos(angle),
      y: cy - r * Math.sin(angle),          // sin is positive upward in SVG-flipped coords
    };
  }

  function arcD(f0: number, f1: number) {
    const s    = ptOnArc(f0);
    const e    = ptOnArc(f1);
    const span = f1 - f0;
    if (span <= 0) return "";
    const large = span > 0.5 ? 1 : 0;
    // sweep-flag=1 means clockwise, which goes left→right on top half
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
  }

  const needlePt   = ptOnArc(pct);
  const color      = inSafe ? "#22c55e" : "#ef4444";
  const leftPt     = ptOnArc(0);
  const rightPt    = ptOnArc(1);

  return (
    <svg viewBox={`0 0 ${W} 130`} style={{ width: "100%", maxWidth: 220 }}>
      {/* Track */}
      <path d={arcD(0, 1)} fill="none" stroke="#e2eaf0" strokeWidth="14" strokeLinecap="round"/>
      {/* Safe zone */}
      <path d={arcD(safePctMin, safePctMax)} fill="none" stroke="#bbf7d0" strokeWidth="14"/>
      {/* Value arc */}
      {pct > 0 && (
        <path d={arcD(0, pct)} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"/>
      )}
      {/* Needle */}
      <line
        x1={cx} y1={cy}
        x2={needlePt.x.toFixed(2)} y2={needlePt.y.toFixed(2)}
        stroke="#18202e" strokeWidth="2.5" strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r="5" fill="#18202e"/>
      <circle cx={cx} cy={cy} r="2.5" fill="white"/>
      {/* Min / max labels at arc ends */}
      <text x={(leftPt.x - 6).toFixed(1)}  y={(leftPt.y + 4).toFixed(1)}  textAnchor="end"    fontSize="9" fill="#8896a8">{min}</text>
      <text x={(rightPt.x + 6).toFixed(1)} y={(rightPt.y + 4).toFixed(1)} textAnchor="start"  fontSize="9" fill="#8896a8">{max}</text>
      {/* Value */}
      <text x={cx} y={cy + 20} textAnchor="middle" fontSize="15" fontWeight="700" fill={color}>
        {value}{unit}
      </text>
      <text x={cx} y={cy + 34} textAnchor="middle" fontSize="9" fill="#8896a8">
        {inSafe ? "Within range" : "Out of range"}
      </text>
    </svg>
  );
}

// ── Radar chart (SVG polygon) ────────────────────────────────────────────────
function RadarChart({ sampleName, data }: { sampleName: string; data: DataPoint[] }) {
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
function LineChart({ points, color, label }: { points: DataPoint[]; color: string; label: string }) {
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
  if (samples.length === 0 || manualData.length === 0) {
    return <p className="no-data">Add manual data to see the heatmap.</p>;
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
    const inSafe = val >= range.safeMin && val <= range.safeMax;
    if (inSafe) {
      const g = Math.round(200 + pct * 55);
      return `rgb(34,${g},94)`;
    } else {
      const r = Math.round(200 + pct * 55);
      return `rgb(${r},60,60)`;
    }
  }

  const CELL_W = 72, CELL_H = 36, LABEL_W = 90, HEADER_H = 48;

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${LABEL_W + params.length * CELL_W + 8} ${HEADER_H + samples.length * CELL_H + 8}`}
        style={{ minWidth: LABEL_W + params.length * CELL_W + 8 }}>
        {/* column headers */}
        {params.map((p, pi) => (
          <text key={pi}
            x={LABEL_W + pi * CELL_W + CELL_W / 2} y={HEADER_H - 6}
            textAnchor="middle" fontSize="9" fontWeight="500" fill="#4a5568">
            {p.split(" ")[0]}
          </text>
        ))}
        {/* rows */}
        {samples.map((s, si) => (
          <g key={si}>
            {/* row label */}
            <text x={LABEL_W - 6} y={HEADER_H + si * CELL_H + CELL_H / 2}
              textAnchor="end" dominantBaseline="central" fontSize="10" fill="#18202e" fontWeight="500">
              {s.sampleName.length > 10 ? s.sampleName.slice(0, 10) + "…" : s.sampleName}
            </text>
            {/* cells */}
            {params.map((p, pi) => {
              const val = getValue(s.sampleName, p);
              const bg = cellColor(val, p);
              return (
                <g key={pi}>
                  <rect
                    x={LABEL_W + pi * CELL_W + 1} y={HEADER_H + si * CELL_H + 1}
                    width={CELL_W - 2} height={CELL_H - 2} rx="4" fill={bg}/>
                  <text
                    x={LABEL_W + pi * CELL_W + CELL_W / 2} y={HEADER_H + si * CELL_H + CELL_H / 2}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize="9" fill={val === null ? "#8896a8" : "#fff"} fontWeight="500">
                    {val === null ? "—" : Number(val.toFixed(1))}
                  </text>
                </g>
              );
            })}
          </g>
        ))}
        {/* legend */}
        <text x={LABEL_W} y={HEADER_H + samples.length * CELL_H + 14}
          fontSize="8" fill="#8896a8">Green = within safe range · Red = out of range · Gray = no data</text>
      </svg>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function ProjectDataPage() {
  const { projectName } = useParams();
  const nav = useNavigate();
  const decodedName = decodeURIComponent(projectName || "");

  const [activeTab, setActiveTab] = useState<PageTab>("data");
  const [refreshKey, setRefreshKey] = useState(0);

  const project = useMemo(() => {
    const saved = JSON.parse(localStorage.getItem("savedProjects") || "[]") as SavedProject[];
    return saved.find((item) => item.projectName === decodedName);
  }, [decodedName, refreshKey]);

  const [collectedData, setCollectedData] = useState<DataPoint[]>(project?.collectedData || []);
  const [manualData,    setManualData]    = useState<DataPoint[]>(project?.manualData    || []);

  const [modalOpen,  setModalOpen]  = useState(false);
  const [modalPhase, setModalPhase] = useState<ModalPhase>("preloaded");

  const [currentSampleIndex, setCurrentSampleIndex] = useState(0);
  const [pendingEntries,     setPendingEntries]     = useState<DataPoint[]>([]);
  const [mParameter,         setMParameter]         = useState(PARAMETERS[0]);
  const [mValue,             setMValue]             = useState("");
  const [mError,             setMError]             = useState("");

  const [newSampleName, setNewSampleName] = useState("");
  const [newRegion,     setNewRegion]     = useState("");
  const [newParam,      setNewParam]      = useState(PARAMETERS[0]);
  const [newValue,      setNewValue]      = useState("");
  const [newError,      setNewError]      = useState("");

  // Chart tab: which sample is selected for radar/gauge
  const [selectedSample, setSelectedSample] = useState<string>("");

  function updateProject(updated: { manualData: DataPoint[]; collectedData: DataPoint[] }) {
    const all = JSON.parse(localStorage.getItem("savedProjects") || "[]") as SavedProject[];
    localStorage.setItem("savedProjects",
      JSON.stringify(all.map((item) => item.projectName === decodedName ? { ...item, ...updated } : item))
    );
  }

  const [confirmDeleteSample, setConfirmDeleteSample] = useState<string | null>(null);

  function deleteSample(sampleName: string) {
    // Remove from manualData
    const newManual = manualData.filter((d) => d.sampleName !== sampleName);
    setManualData(newManual);

    // Remove from formData.samples in localStorage
    const all = JSON.parse(localStorage.getItem("savedProjects") || "[]") as SavedProject[];
    const updated = all.map((item) => {
      if (item.projectName !== decodedName) return item;
      const samples = (item.formData.samples as SampleEntry[] | undefined) || [];
      return {
        ...item,
        formData: {
          ...item.formData,
          samples: samples.filter((s) => s.sampleName !== sampleName),
        },
        manualData: (item.manualData as DataPoint[]).filter((d) => d.sampleName !== sampleName),
      };
    });
    localStorage.setItem("savedProjects", JSON.stringify(updated));

    // If deleted sample was selected in charts, clear selection
    if (selectedSample === sampleName) setSelectedSample("");
    setConfirmDeleteSample(null);
    // Force project to re-read from localStorage
    setRefreshKey((k) => k + 1);
  }

  function connectSystem()   { window.alert("System connected."); }

  function startCollecting() {
    const next = { x: collectedData.length + 1, y: Math.floor(Math.random() * 100) };
    const updated = [...collectedData, next];
    setCollectedData(updated);
    updateProject({ collectedData: updated, manualData });
  }

  function openManualModal() {
    setPendingEntries([]); setMParameter(PARAMETERS[0]); setMValue(""); setMError("");
    setNewSampleName(""); setNewRegion(""); setNewParam(PARAMETERS[0]); setNewValue(""); setNewError("");
    // Read fresh from localStorage so we get the latest samples after any deletions
    const freshProject = (JSON.parse(localStorage.getItem("savedProjects") || "[]") as SavedProject[])
      .find((p) => p.projectName === decodedName);
    const freshSamples: SampleEntry[] = Array.isArray(freshProject?.formData?.samples)
      ? (freshProject!.formData.samples as SampleEntry[])
      : [];
    const isManualOnly = Boolean(freshProject?.formData?.manualOnly);
    if (isManualOnly && freshSamples.length > 0) {
      setCurrentSampleIndex(0);
      setModalPhase("preloaded");
    } else {
      // Not manualOnly, or all preloaded samples deleted — go straight to new sample
      setModalPhase("new-sample");
    }
    setModalOpen(true);
  }

  function submitPreloadedEntry(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mValue.trim() === "" || isNaN(Number(mValue))) { setMError("Please enter a valid numeric value."); return; }
    const sample = multiSamples[currentSampleIndex];
    const entry: DataPoint = {
      x: manualData.length + pendingEntries.length + 1,
      y: Number(mValue), sampleName: sample.sampleName, region: sample.region, parameter: mParameter,
    };
    const newPending = [...pendingEntries, entry];
    setPendingEntries(newPending);
    const isLast = currentSampleIndex >= multiSamples.length - 1;
    if (!isLast) {
      setCurrentSampleIndex(currentSampleIndex + 1); setMParameter(PARAMETERS[0]); setMValue(""); setMError("");
    } else {
      const updated = [...manualData, ...newPending];
      setManualData(updated); updateProject({ collectedData, manualData: updated }); setPendingEntries([]);
      goToNewSamplePhase();
    }
  }

  function skipPreloadedSample() {
    const isLast = currentSampleIndex >= multiSamples.length - 1;
    if (!isLast) {
      setCurrentSampleIndex(currentSampleIndex + 1); setMParameter(PARAMETERS[0]); setMValue(""); setMError("");
    } else {
      if (pendingEntries.length > 0) {
        const updated = [...manualData, ...pendingEntries];
        setManualData(updated); updateProject({ collectedData, manualData: updated }); setPendingEntries([]);
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
    setNewError(""); setModalPhase("new-entry");
  }

  function submitNewEntry(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (newValue.trim() === "" || isNaN(Number(newValue))) { setNewError("Please enter a valid numeric value."); return; }
    const entry: DataPoint = {
      x: manualData.length + 1, y: Number(newValue),
      sampleName: newSampleName.trim(), region: newRegion.trim(), parameter: newParam,
    };
    const updated = [...manualData, entry];
    setManualData(updated); updateProject({ collectedData, manualData: updated });
    setNewValue(""); setNewError(""); setNewParam(PARAMETERS[0]); setNewSampleName(""); setNewRegion("");
    setModalPhase("new-sample");
  }

  function exportData(format: "json" | "csv") {
    if (!project) return;
    const exportObject = { ...project, manualData, collectedData };
    if (format === "json") {
      const blob = new Blob([JSON.stringify(exportObject, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${decodedName}.json`; a.click();
      URL.revokeObjectURL(url);
    }
    if (format === "csv") {
      const rows = [
        ["type", "x", "y", "sampleName", "region", "parameter"],
        ...collectedData.map((p) => ["collected", String(p.x), String(p.y), "", "", ""]),
        ...manualData.map((p) => ["manual", String(p.x), String(p.y), p.sampleName || "", p.region || "", p.parameter || ""]),
      ];
      const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob); const a = document.createElement("a");
      a.href = url; a.download = `${decodedName}.csv`; a.click(); URL.revokeObjectURL(url);
    }
  }

  if (!project) {
    return (
      <div style={{ padding: "2rem" }}>
        <h2>Project not found</h2>
        <p>Check that the project was saved before opening this page.</p>
        <button type="button" onClick={() => nav("/app")}>Back to Dashboard</button>
      </div>
    );
  }

  const fd = project.formData;

  const multiSamples: SampleEntry[] = (() => {
    if (Array.isArray(fd.samples)) return fd.samples as SampleEntry[];
    if (fd.sampleName || fd.region) return [{ sampleName: String(fd.sampleName || "—"), region: String(fd.region || "—") }];
    return [];
  })();

  const manualCountBySample: Record<string, number> = {};
  for (const p of manualData) {
    const key = p.sampleName || "Unknown";
    manualCountBySample[key] = (manualCountBySample[key] || 0) + 1;
  }

  const parameterGroups: Record<string, DataPoint[]> = {};
  for (const p of manualData) {
    const key = p.parameter || "Other";
    if (!parameterGroups[key]) parameterGroups[key] = [];
    parameterGroups[key].push(p);
  }
  const parameterKeys = Object.keys(parameterGroups);

  const quality = collectedData.length ? collectedData[collectedData.length - 1].y : 0;
  const collectedMaxY = Math.max(...collectedData.map((p) => p.y), 1);

  function scoreForSample(sampleName: string): number {
    const points = manualData.filter((p) => p.sampleName === sampleName);
    if (points.length === 0) return 0;
    let score = 100, checked = 0;
    for (const p of points) {
      const param = p.parameter || "";
      if (param === "pH")               { checked++; if (p.y < 6.5 || p.y > 8.5) score -= 25; }
      else if (param === "Turbidity (NTU)") { checked++; if (p.y > 5)   score -= 25; }
      else if (param === "TDS (ppm)")   { checked++; if (p.y > 500)  score -= 25; }
      else if (param === "Temperature (C)") { checked++; if (p.y > 35)  score -= 15; }
      else if (param === "Dissolved Oxygen") { checked++; if (p.y < 6)  score -= 20; }
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
    if (score >= 85) return "#22c55e";
    if (score >= 70) return "#84cc16";
    if (score >= 50) return "#f59e0b";
    if (score >  0)  return "#ef4444";
    return "#94a3b8";
  }

  const allKnownSamples: SampleEntry[] = (() => {
    const seen = new Map<string, SampleEntry>();
    for (const s of multiSamples) seen.set(s.sampleName, s);
    for (const p of manualData) {
      if (p.sampleName && !seen.has(p.sampleName))
        seen.set(p.sampleName, { sampleName: p.sampleName, region: p.region || "" });
    }
    return Array.from(seen.values());
  })();

  const sampleScores = allKnownSamples
    .map((s) => ({ ...s, score: scoreForSample(s.sampleName) }))
    .sort((a, b) => b.score - a.score);

  const currentSample   = multiSamples[currentSampleIndex];
  const isLastPreloaded = currentSampleIndex >= multiSamples.length - 1;

  // Charts tab: resolve selected sample
  const activeSample = selectedSample || allKnownSamples[0]?.sampleName || "";
  const activeSampleData = manualData.filter((d) => d.sampleName === activeSample);

  // Gauges: latest value per parameter for active sample
  const gaugeParams = Object.keys(PARAM_RANGES).filter((p) =>
    activeSampleData.some((d) => d.parameter === p)
  );

  return (
    <div className="project-data-page">

      {/* TOPBAR */}
      <header className="topbar">
        <div className="topbar-left">
          <div className="logo">
            <img src="/logocerte.png" alt="CERTE logo" />
            <strong>CERTE</strong>
          </div>
          <button type="button" className="back-btn" onClick={() => {
            try {
              const role = JSON.parse(localStorage.getItem("currentUser") || "{}").role;
              nav(role === "admin" ? "/admin" : "/app");
            } catch { nav("/app"); }
          }}>← Back</button>
          <h1 className="topbar-project-name">{decodedName}</h1>
        </div>
        <div className="export-actions">
          <button type="button" onClick={() => exportData("json")}>Export JSON</button>
          <button type="button" onClick={() => exportData("csv")}>Export CSV</button>
        </div>
      </header>

      <div className="project-layout">
        <aside className="project-sidebar">
          <button type="button" onClick={connectSystem}>Connect to system</button>
          <button type="button" onClick={startCollecting}>Start collecting data</button>
          <button type="button" onClick={openManualModal}>Add manual data</button>

          <div className="project-info-panel">
            <div className="system-badge">
              {project.systemType === "dosing" ? "Dosing System" : "MultiSensor System"}
            </div>

            {project.systemType === "dosing" && (
              <>
                <div className="info-row">
                  <span className="info-label">Dosing liquid</span>
                  <span className="info-value">{String(fd.liquid || "—")}</span>
                </div>
                <div className="info-section-title">Sources</div>
                <ul className="info-list">
                  {(fd.sources as string[]).filter((s) => s.trim()).map((s, i) => (
                    <li key={i}><span className="info-list-index">S{i + 1}</span> {s}</li>
                  ))}
                </ul>
              </>
            )}

            {project.systemType === "multisensor" && (
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
                          <button
                            type="button"
                            className="sample-delete-btn"
                            title={`Delete ${s.sampleName}`}
                            onClick={() => setConfirmDeleteSample(s.sampleName)}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                              <path d="M10 11v6"/><path d="M14 11v6"/>
                              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                            </svg>
                          </button>
                        </div>
                        <div className="info-sample-region">{s.region || "—"}</div>
                        {count > 0 && (
                          <div className="info-sample-count">
                            {count} manual entr{count === 1 ? "y" : "ies"}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
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

              <div className="graph-card" style={{ gridColumn: "1 / -1" }}>
                <h2>Collected data</h2>
                {collectedData.length === 0 ? (
                  <p className="no-data">No data yet. Click "Start collecting data".</p>
                ) : (
                  <div className="bar-chart">
                    {collectedData.map((point) => (
                      <div key={point.x} className="bar-col">
                        <span className="bar-label">{point.y}</span>
                        <div className="bar" style={{ height: `${(point.y / collectedMaxY) * 100}%` }} />
                        <span className="bar-x">{point.x}</span>
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
                            <div className="bar" style={{ height: `${(Math.abs(point.y) / maxY) * 100}%`, background: color }} />
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
                      <div className="quality-fill" style={{ width: `${Math.min(quality, 100)}%` }} />
                    </div>
                    <p>Quality score: {quality}/100</p>
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
                  <input id="new-sample-name" value={newSampleName} required placeholder="e.g. Lake B" autoFocus
                    onChange={(e) => { setNewSampleName(e.target.value); setNewError(""); }} />
                  <label htmlFor="new-region">Region</label>
                  <input id="new-region" value={newRegion} placeholder="e.g. North Zone" onChange={(e) => setNewRegion(e.target.value)} />
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
              <button
                type="button"
                style={{ background: "var(--danger)", borderColor: "var(--danger)" }}
                onClick={() => deleteSample(confirmDeleteSample)}
              >
                Yes, delete sample
              </button>
              <button type="button" onClick={() => setConfirmDeleteSample(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}