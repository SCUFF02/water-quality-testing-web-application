import { useState } from "react";
import { useNavigate } from "react-router-dom";

type Props = { onClose: () => void; projects: string[]; };
const PARAMETERS = ["pH", "Temperature (C)", "Turbidity (NTU)", "TDS (ppm)", "Conductivity"];
const API = "http://localhost:8000";
function token() { return localStorage.getItem("token") || ""; }

export default function MultiSensorForm({ onClose, projects }: Props) {
  const nav = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [projectName, setProjectName] = useState("");
  const [sampleCount, setSampleCount] = useState(1);
  const [manualOnly, setManualOnly] = useState(false);
  const [selectedParams, setSelectedParams] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>(Array.from({ length: 10 }, () => ""));
  const [regions, setRegions] = useState<string[]>(Array.from({ length: 10 }, () => ""));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const previousSources = ["Well A", "Tank B", "River", "Lake C"];

  function toggleParam(name: string) {
    setSelectedParams(prev => prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name]);
    setError("");
  }

  function updateSource(index: number, value: string) {
    const next = [...sources]; next[index] = value;
    const normalized = next.map(s => s.trim().toLowerCase()).filter(Boolean);
    setError(normalized.some((s, i) => normalized.indexOf(s) !== i) ? "Sample names must be unique." : "");
    setSources(next);
  }

  function updateRegion(index: number, value: string) {
    const next = [...regions]; next[index] = value;
    setRegions(next);
  }

  function goToStep2(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = projectName.trim();
    if (!trimmed) { setError("Project name is required."); return; }
    if (projects.some(p => p.trim().toLowerCase() === trimmed.toLowerCase())) { setError("This project name already exists."); return; }
    if (sampleCount < 1 || sampleCount > 10) { setError("Number of samples must be between 1 and 10."); return; }
    if (selectedParams.length === 0) { setError("Select at least one parameter to monitor."); return; }
    setError(""); setStep(2);
  }

  async function saveProject() {
    const activeSources = sources.slice(0, sampleCount);
    const activeRegions = regions.slice(0, sampleCount);
    if (activeSources.some(s => !s.trim())) { setError(`All ${sampleCount} sample names are required.`); return; }
    const normalized = activeSources.map(s => s.trim().toLowerCase());
    if (normalized.some((s, i) => normalized.indexOf(s) !== i)) { setError("Sample names must be unique."); return; }
    setError(""); setSaving(true);
    try {
      const res = await fetch(`${API}/multisensor/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          name:        projectName.trim(),
          system_type: "multisensor",
          manual_only: manualOnly,
          samples:     activeSources.map((s, i) => ({ sample_name: s.trim(), region: activeRegions[i].trim() })),
        }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.detail || "Failed to create project."); return; }
      const data = await res.json();
      onClose();
      nav(`/project/${encodeURIComponent(data.id)}`);
    } catch { setError("Could not connect to server."); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-large" onClick={e => e.stopPropagation()}>
        <h3>MultiSensor System</h3>

        {step === 1 && (
          <form onSubmit={goToStep2}>
            <div className="step-indicator">Step 1 of 2 — Project setup</div>
            <label htmlFor="ms-projectName">Project name</label>
            <input id="ms-projectName" value={projectName} required placeholder="Enter project name"
              onChange={e => { setProjectName(e.target.value); setError(""); }} />
            <label htmlFor="ms-sampleCount">Number of samples (1–10)</label>
            <input id="ms-sampleCount" type="number" min={1} max={10} value={sampleCount} required
              onChange={e => { setSampleCount(Number(e.target.value)); setError(""); }} />
            <p className="param-section-label">Parameters to monitor</p>
            <div className="param-toggle-grid">
              {PARAMETERS.map(p => (
                <button key={p} type="button"
                  className={`param-toggle${selectedParams.includes(p) ? " param-toggle-active" : ""}`}
                  onClick={() => toggleParam(p)}>{p}</button>
              ))}
            </div>
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions-column">
              <div className="modal-actions-row">
                <button type="submit" onClick={() => setManualOnly(false)}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                  </svg>
                  With ESP32 device
                </button>
                <button type="submit" className="btn-secondary" onClick={() => setManualOnly(true)}>
                  Manual input only
                </button>
              </div>
              <div className="modal-actions-row">
                <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
              </div>
            </div>
          </form>
        )}

        {step === 2 && (
          <div>
            <div className="step-indicator">Step 2 of 2 — Samples ({sampleCount} required)</div>
            <div className="samples-grid">
              {Array.from({ length: sampleCount }, (_, i) => (
                <div key={i} className="sample-entry">
                  <p className="sample-entry-title">Sample {i + 1}</p>
                  <label htmlFor={`ms-source-${i}`}>Sample name</label>
                  <input id={`ms-source-${i}`} list="ms-sources-list" value={sources[i]} required
                    placeholder="e.g. Well A" maxLength={18}
                    onChange={e => updateSource(i, e.target.value)} />
                  <label htmlFor={`ms-region-${i}`} style={{ marginTop: 6 }}>Region</label>
                  <input id={`ms-region-${i}`} value={regions[i]}
                    placeholder="e.g. North Zone" maxLength={25}
                    onChange={e => updateRegion(i, e.target.value)} />
                </div>
              ))}
            </div>
            <datalist id="ms-sources-list">
              {previousSources.map((s, i) => <option key={i} value={s} />)}
            </datalist>
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions-column">
              <div className="modal-actions-row">
                <button type="button" onClick={saveProject} disabled={saving}>
                  {saving ? "Saving…" : "Create project"}
                </button>
              </div>
              <div className="modal-actions-row">
                <button type="button" className="btn-ghost" onClick={() => { setStep(1); setError(""); }}>Back</button>
                <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
