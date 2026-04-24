import { useState } from "react";
import { useNavigate } from "react-router-dom";

type Props = { onClose: () => void; projects: string[]; };
const PARAMETERS = ["pH", "Turbidity", "TDS", "Temperature", "Conductivity", "Dissolved Oxygen", "Nitrates"];
const LIQUIDS = ["Chlorine", "Alum", "Lime", "Ferric Sulfate", "Sodium Hypochlorite", "Hydrogen Peroxide", "Ozone", "Fluoride"];
const API = "http://localhost:8000";
function token() { return localStorage.getItem("token") || ""; }

export default function DosingSystemForm({ onClose, projects }: Props) {
  const nav = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [projectName, setProjectName] = useState("");
  const [sampleCount, setSampleCount] = useState(1);
  const [selectedParams, setSelectedParams] = useState<string[]>([]);
  const [selectedLiquids, setSelectedLiquids] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>(Array.from({ length: 10 }, () => ""));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const previousSources = ["Well A", "Tank B", "River"];

  function toggleParam(name: string) {
    setSelectedParams(prev => prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name]);
    setError("");
  }
  function toggleLiquid(name: string) {
    setSelectedLiquids(prev => prev.includes(name) ? prev.filter(l => l !== name) : [...prev, name]);
    setError("");
  }
  function updateSource(index: number, value: string) {
    const next = [...sources]; next[index] = value;
    const normalized = next.map(s => s.trim().toLowerCase()).filter(Boolean);
    setError(normalized.some((s, i) => normalized.indexOf(s) !== i) ? "Source names must be unique." : "");
    setSources(next);
  }

  function goToStep2(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = projectName.trim();
    if (!trimmed) { setError("Project name is required."); return; }
    if (projects.some(p => p.trim().toLowerCase() === trimmed.toLowerCase())) { setError("This project name already exists."); return; }
    if (sampleCount < 1 || sampleCount > 10) { setError("Number of sources must be between 1 and 10."); return; }
    if (selectedParams.length === 0) { setError("Select at least one parameter."); return; }
    if (selectedLiquids.length === 0) { setError("Select at least one dosing liquid."); return; }
    setError(""); setStep(2);
  }

  async function saveAndNavigate(manualOnly: boolean) {
    const activeSources = sources.slice(0, sampleCount);
    if (activeSources.some(s => !s.trim())) { setError(`All ${sampleCount} source names are required.`); return; }
    const normalized = activeSources.map(s => s.trim().toLowerCase());
    if (normalized.some((s, i) => normalized.indexOf(s) !== i)) { setError("Source names must be unique."); return; }
    setError(""); setSaving(true);
    try {
      const res = await fetch(`${API}/dosing/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          name: projectName.trim(), system_type: "dosing", manual_only: manualOnly,
          samples: activeSources.map(s => ({ sample_name: s, region: "" })),
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
        <h3>Dosing System</h3>
        {step === 1 && (
          <form onSubmit={goToStep2}>
            <div className="step-indicator">Step 1 of 2 — Project setup</div>
            <label htmlFor="projectName">Project name</label>
            <input id="projectName" value={projectName} required placeholder="Enter project name"
              onChange={e => { setProjectName(e.target.value); setError(""); }} />
            <label htmlFor="sampleCount">Number of sources (1–10)</label>
            <input id="sampleCount" type="number" min={1} max={10} value={sampleCount} required
              onChange={e => { setSampleCount(Number(e.target.value)); setError(""); }} />
            <p className="param-section-label">Parameters to monitor</p>
            <div className="param-toggle-grid">
              {PARAMETERS.map(p => (
                <button key={p} type="button" className={`param-toggle${selectedParams.includes(p) ? " param-toggle-active" : ""}`}
                  onClick={() => toggleParam(p)}>{p}</button>
              ))}
            </div>
            <p className="param-section-label" style={{ marginTop: 16 }}>Dosing liquids</p>
            <div className="param-toggle-grid">
              {LIQUIDS.map(l => (
                <button key={l} type="button" className={`param-toggle${selectedLiquids.includes(l) ? " param-toggle-active param-toggle-liquid" : ""}`}
                  onClick={() => toggleLiquid(l)}>{l}</button>
              ))}
            </div>
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions">
              <button type="submit">Next</button>
              <button type="button" onClick={onClose}>Cancel</button>
            </div>
          </form>
        )}
        {step === 2 && (
          <div>
            <div className="step-indicator">Step 2 of 2 — Sources ({sampleCount} required)</div>
            <div className="samples-grid">
              {Array.from({ length: sampleCount }, (_, i) => (
                <div key={i} className="sample-entry">
                  <p className="sample-entry-title">Source {i + 1}</p>
                  <label htmlFor={`source-${i}`}>Source name</label>
                  <input id={`source-${i}`} list="sources-list" value={sources[i]} required
                    placeholder="e.g. Well A" maxLength={18} onChange={e => updateSource(i, e.target.value)} />
                </div>
              ))}
            </div>
            <datalist id="sources-list">{previousSources.map((s, i) => <option key={i} value={s} />)}</datalist>
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions-column">
              <div className="modal-actions-row">
                <button type="button" onClick={() => saveAndNavigate(false)} disabled={saving}>
                  {saving ? "Saving…" : "Start Dosing"}
                </button>
                <button type="button" className="btn-secondary" onClick={() => saveAndNavigate(true)} disabled={saving}>
                  Manual Input Only
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