import { useMemo, useState } from "react";
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
  systemType: "multisensor" | "dosing";
  timestamp: string;
  formData: Record<string, unknown>;
  manualData: DataPoint[];
  collectedData: DataPoint[];
};

// Modal can be in one of these phases:
// "preloaded"  — cycling through the samples defined in the form
// "new-sample" — user is filling in a brand-new sample name/region
// "new-entry"  — user is entering parameter+value for the new sample
type ModalPhase = "preloaded" | "new-sample" | "new-entry";

const PARAMETERS = [
  "pH",
  "Turbidity (NTU)",
  "TDS (ppm)",
  "Temperature (C)",
  "Conductivity",
  "Dissolved Oxygen",
  "Other",
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

export default function ProjectDataPage() {
  const { projectName } = useParams();
  const nav = useNavigate();
  const decodedName = decodeURIComponent(projectName || "");

  const project = useMemo(() => {
    const saved: SavedProject[] = JSON.parse(localStorage.getItem("savedProjects") || "[]");
    return saved.find((item) => item.projectName === decodedName);
  }, [decodedName]);

  const [collectedData, setCollectedData] = useState<DataPoint[]>(project?.collectedData || []);
  const [manualData,    setManualData]    = useState<DataPoint[]>(project?.manualData    || []);

  // ── Modal state ──────────────────────────────────────────────────
  const [modalOpen,   setModalOpen]   = useState(false);
  const [modalPhase,  setModalPhase]  = useState<ModalPhase>("preloaded");

  // Preloaded-sample cycling
  const [currentSampleIndex, setCurrentSampleIndex] = useState(0);
  const [pendingEntries,     setPendingEntries]     = useState<DataPoint[]>([]);
  const [mParameter,         setMParameter]         = useState(PARAMETERS[0]);
  const [mValue,             setMValue]             = useState("");
  const [mError,             setMError]             = useState("");

  // New-sample form
  const [newSampleName, setNewSampleName] = useState("");
  const [newRegion,     setNewRegion]     = useState("");
  const [newParam,      setNewParam]      = useState(PARAMETERS[0]);
  const [newValue,      setNewValue]      = useState("");
  const [newError,      setNewError]      = useState("");
  // ─────────────────────────────────────────────────────────────────

  function updateProject(updated: { manualData: DataPoint[]; collectedData: DataPoint[] }) {
    const all: SavedProject[] = JSON.parse(localStorage.getItem("savedProjects") || "[]");
    localStorage.setItem(
      "savedProjects",
      JSON.stringify(all.map((item) => (item.projectName === decodedName ? { ...item, ...updated } : item)))
    );
  }

  function connectSystem()   { window.alert("System connected."); }

  function startCollecting() {
    const next = { x: collectedData.length + 1, y: Math.floor(Math.random() * 100) };
    const updated = [...collectedData, next];
    setCollectedData(updated);
    updateProject({ collectedData: updated, manualData });
  }

  // ── Open modal ───────────────────────────────────────────────────
  function openManualModal() {
    setPendingEntries([]);
    setMParameter(PARAMETERS[0]);
    setMValue("");
    setMError("");
    setNewSampleName("");
    setNewRegion("");
    setNewParam(PARAMETERS[0]);
    setNewValue("");
    setNewError("");

    const fd = project!.formData;
    const isManualOnly = Boolean(fd.manualOnly);

    if (isManualOnly) {
      // manualOnly: start by cycling preloaded samples
      setCurrentSampleIndex(0);
      setModalPhase("preloaded");
    } else {
      // start measuring: go straight to new-sample form
      setModalPhase("new-sample");
    }
    setModalOpen(true);
  }
  // ─────────────────────────────────────────────────────────────────

  // ── Preloaded phase: submit one sample entry ──────────────────────
  function submitPreloadedEntry(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mValue.trim() === "" || isNaN(Number(mValue))) {
      setMError("Please enter a valid numeric value.");
      return;
    }
    const sample = multiSamples[currentSampleIndex];
    const entry: DataPoint = {
      x: manualData.length + pendingEntries.length + 1,
      y: Number(mValue),
      sampleName: sample.sampleName,
      region:     sample.region,
      parameter:  mParameter,
    };
    const newPending = [...pendingEntries, entry];
    setPendingEntries(newPending);

    const isLast = currentSampleIndex >= multiSamples.length - 1;
    if (!isLast) {
      setCurrentSampleIndex(currentSampleIndex + 1);
      setMParameter(PARAMETERS[0]);
      setMValue("");
      setMError("");
    } else {
      // Done with preloaded samples — save and offer to add new
      const updated = [...manualData, ...newPending];
      setManualData(updated);
      updateProject({ collectedData, manualData: updated });
      setPendingEntries([]);
      goToNewSamplePhase();
    }
  }

  function skipPreloadedSample() {
    const isLast = currentSampleIndex >= multiSamples.length - 1;
    if (!isLast) {
      setCurrentSampleIndex(currentSampleIndex + 1);
      setMParameter(PARAMETERS[0]);
      setMValue("");
      setMError("");
    } else {
      // Save whatever was pending and offer to add new
      if (pendingEntries.length > 0) {
        const updated = [...manualData, ...pendingEntries];
        setManualData(updated);
        updateProject({ collectedData, manualData: updated });
        setPendingEntries([]);
      }
      goToNewSamplePhase();
    }
  }
  // ─────────────────────────────────────────────────────────────────

  function goToNewSamplePhase() {
    setNewSampleName("");
    setNewRegion("");
    setNewParam(PARAMETERS[0]);
    setNewValue("");
    setNewError("");
    setModalPhase("new-sample");
  }

  // ── New-sample phase: confirm name+region, move to entry ──────────
  function submitNewSampleInfo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newSampleName.trim()) { setNewError("Sample name is required."); return; }
    setNewError("");
    setModalPhase("new-entry");
  }
  // ─────────────────────────────────────────────────────────────────

  // ── New-entry phase: save one data point for the new sample ───────
  function submitNewEntry(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (newValue.trim() === "" || isNaN(Number(newValue))) {
      setNewError("Please enter a valid numeric value.");
      return;
    }
    const entry: DataPoint = {
      x: manualData.length + 1,
      y: Number(newValue),
      sampleName: newSampleName.trim(),
      region:     newRegion.trim(),
      parameter:  newParam,
    };
    const updated = [...manualData, entry];
    setManualData(updated);
    updateProject({ collectedData, manualData: updated });

    // Reset and offer to add another
    setNewValue("");
    setNewError("");
    setNewParam(PARAMETERS[0]);
    setNewSampleName("");
    setNewRegion("");
    setModalPhase("new-sample");
  }
  // ─────────────────────────────────────────────────────────────────

  function exportData(format: "json" | "csv") {
    if (!project) return;
    const exportObject = { ...project, manualData, collectedData };
    if (format === "json") {
      const blob = new Blob([JSON.stringify(exportObject, null, 2)], { type: "application/json" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `${decodedName}.json`; a.click();
      URL.revokeObjectURL(url);
    }
    if (format === "csv") {
      const rows = [
        ["type", "x", "y", "sampleName", "region", "parameter"],
        ...collectedData.map((p) => ["collected", String(p.x), String(p.y), "", "", ""]),
        ...manualData.map((p)    => ["manual",    String(p.x), String(p.y), p.sampleName || "", p.region || "", p.parameter || ""]),
      ];
      const csv  = rows.map((r) => r.join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `${decodedName}.csv`; a.click();
      URL.revokeObjectURL(url);
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
    let score = 100;
    let checked = 0;
    for (const p of points) {
      const param = p.parameter || "";
      if (param === "pH") { checked++; if (p.y < 6.5 || p.y > 8.5) score -= 25; }
      else if (param === "Turbidity (NTU)") { checked++; if (p.y > 5) score -= 25; }
      else if (param === "TDS (ppm)") { checked++; if (p.y > 500) score -= 25; }
      else if (param === "Temperature (C)") { checked++; if (p.y > 35) score -= 15; }
      else if (param === "Dissolved Oxygen") { checked++; if (p.y < 6) score -= 20; }
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

  // All samples that have appeared in manual data (preloaded + any new ones added)
  const allKnownSamples: SampleEntry[] = (() => {
    const seen = new Map<string, SampleEntry>();
    for (const s of multiSamples) seen.set(s.sampleName, s);
    for (const p of manualData) {
      if (p.sampleName && !seen.has(p.sampleName)) {
        seen.set(p.sampleName, { sampleName: p.sampleName, region: p.region || "" });
      }
    }
    return Array.from(seen.values());
  })();

  const sampleScores = allKnownSamples
    .map((s) => ({ ...s, score: scoreForSample(s.sampleName) }))
    .sort((a, b) => b.score - a.score);

  const currentSample    = multiSamples[currentSampleIndex];
  const isLastPreloaded  = currentSampleIndex >= multiSamples.length - 1;

  return (
    <div className="project-data-page">

      {/* TOPBAR */}
      <header className="topbar">
        <div className="topbar-left">
          <div className="logo">
            <img src="/logocerte.png" alt="CERTE logo" />
            <strong>CERTE</strong>
          </div>
          <button type="button" className="back-btn" onClick={() => nav("/app")}>← Back</button>
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

        <main className="project-main">

          {/* COLLECTED DATA CHART */}
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

          {/* ONE CHART PER PARAMETER */}
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

          {/* WATER QUALITY */}
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
                    <th>Rank</th>
                    <th>Sample</th>
                    <th>Region</th>
                    <th>Score</th>
                    <th>Quality</th>
                    <th style={{ width: "40%" }}>Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {sampleScores.map((s, i) => (
                    <tr key={s.sampleName}>
                      <td className="quality-rank">
                        {i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "3rd" : `${i + 1}th`}
                      </td>
                      <td style={{ fontWeight: 600 }}>{s.sampleName}</td>
                      <td style={{ color: "var(--text-soft)", fontSize: 13 }}>{s.region}</td>
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

        </main>
      </div>

      {/* ── MANUAL DATA MODAL ─────────────────────────────────────── */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>

            {/* ── PHASE: cycling preloaded samples ── */}
            {modalPhase === "preloaded" && currentSample && (
              <>
                <div className="step-indicator">
                  Sample {currentSampleIndex + 1} of {multiSamples.length}
                </div>
                <h3>Add manual data</h3>

                <div className="manual-sample-info">
                  <div className="info-row">
                    <span className="info-label">Sample</span>
                    <span className="info-value">{currentSample.sampleName}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Region</span>
                    <span className="info-value">{currentSample.region}</span>
                  </div>
                </div>

                <form onSubmit={submitPreloadedEntry}>
                  <label htmlFor="m-parameter">Parameter</label>
                  <select id="m-parameter" value={mParameter} className="modal-select"
                    onChange={(e) => setMParameter(e.target.value)}>
                    {PARAMETERS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>

                  <label htmlFor="m-value">Value</label>
                  <input id="m-value" type="number" step="any" value={mValue} required
                    placeholder="Enter measured value" autoFocus
                    onChange={(e) => { setMValue(e.target.value); setMError(""); }} />

                  {mError && <p className="form-error">{mError}</p>}

                  <div className="modal-actions-column">
                    <div className="modal-actions-row">
                      <button type="submit">
                        {isLastPreloaded ? "Save & add new sample" : "Next sample →"}
                      </button>
                      <button type="button" className="btn-secondary" onClick={skipPreloadedSample}>
                        {isLastPreloaded ? "Skip & add new sample" : "Skip"}
                      </button>
                    </div>
                    <div className="modal-actions-row">
                      <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                </form>
              </>
            )}

            {/* ── PHASE: new sample name + region ── */}
            {modalPhase === "new-sample" && (
              <>
                <h3>Add new sample</h3>
                <p style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 12 }}>
                  Enter the details for a new sample to record data for.
                </p>

                <form onSubmit={submitNewSampleInfo}>
                  <label htmlFor="new-sample-name">Sample name</label>
                  <input id="new-sample-name" value={newSampleName} required
                    placeholder="e.g. Lake B" autoFocus
                    onChange={(e) => { setNewSampleName(e.target.value); setNewError(""); }} />

                  <label htmlFor="new-region">Region</label>
                  <input id="new-region" value={newRegion}
                    placeholder="e.g. North Zone"
                    onChange={(e) => setNewRegion(e.target.value)} />

                  {newError && <p className="form-error">{newError}</p>}

                  <div className="modal-actions-column">
                    <div className="modal-actions-row">
                      <button type="submit">Next →</button>
                    </div>
                    <div className="modal-actions-row">
                      <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>
                        Done — close
                      </button>
                    </div>
                  </div>
                </form>
              </>
            )}

            {/* ── PHASE: enter parameter value for new sample ── */}
            {modalPhase === "new-entry" && (
              <>
                <h3>Record data</h3>

                <div className="manual-sample-info">
                  <div className="info-row">
                    <span className="info-label">Sample</span>
                    <span className="info-value">{newSampleName}</span>
                  </div>
                  {newRegion && (
                    <div className="info-row">
                      <span className="info-label">Region</span>
                      <span className="info-value">{newRegion}</span>
                    </div>
                  )}
                </div>

                <form onSubmit={submitNewEntry}>
                  <label htmlFor="new-param">Parameter</label>
                  <select id="new-param" value={newParam} className="modal-select"
                    onChange={(e) => setNewParam(e.target.value)}>
                    {PARAMETERS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>

                  <label htmlFor="new-val">Value</label>
                  <input id="new-val" type="number" step="any" value={newValue} required
                    placeholder="Enter measured value" autoFocus
                    onChange={(e) => { setNewValue(e.target.value); setNewError(""); }} />

                  {newError && <p className="form-error">{newError}</p>}

                  <div className="modal-actions-column">
                    <div className="modal-actions-row">
                      <button type="submit">Save & add another sample</button>
                    </div>
                    <div className="modal-actions-row">
                      <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>
                        Done — close
                      </button>
                    </div>
                  </div>
                </form>
              </>
            )}

          </div>
        </div>
      )}
    </div>
  );
}





