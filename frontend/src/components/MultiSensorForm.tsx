import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface Props { onClose: () => void; projects: string[]; }
type SampleEntry = { sampleName: string; region: string };

const API = "http://localhost:8000";
function token() { return localStorage.getItem("token") || ""; }

export default function MultiSensorForm({ onClose, projects }: Props) {
  const nav = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [projectName, setProjectName] = useState("");
  const [sampleCount, setSampleCount] = useState<number>(1);
  const [error, setError] = useState("");
  const [samples, setSamples] = useState<SampleEntry[]>([]);
  const [saving, setSaving] = useState(false);

  const previousSamples = ["River A", "Lake B", "Station 3"];
  const previousRegions = ["North", "South", "Central"];

  function updateSample(index: number, field: keyof SampleEntry, value: string) {
    const next = [...samples];
    next[index] = { ...next[index], [field]: value };
    setSamples(next);
  }

  function goToStep2(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = projectName.trim();
    if (!trimmed) { setError("Project name is required."); return; }
    if (projects.some(p => p.trim().toLowerCase() === trimmed.toLowerCase())) {
      setError("This project name already exists."); return;
    }
    if (sampleCount < 1 || sampleCount > 50) { setError("Number of samples must be between 1 and 50."); return; }
    setError("");
    setSamples(Array.from({ length: sampleCount }, () => ({ sampleName: "", region: "" })));
    setStep(2);
  }

  async function saveAndNavigate(manualOnly: boolean) {
    const incomplete = samples.some(s => !s.sampleName.trim() || !s.region.trim());
    if (incomplete) { setError("Please fill in all sample names and regions."); return; }
    setError(""); setSaving(true);
    try {
      const res = await fetch(`${API}/multisensor/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          name: projectName.trim(), system_type: "multisensor", manual_only: manualOnly,
          samples: samples.map(s => ({ sample_name: s.sampleName, region: s.region })),
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
            <label htmlFor="projectName">Project name</label>
            <input id="projectName" value={projectName} required placeholder="Enter project name"
              onChange={e => { setProjectName(e.target.value); setError(""); }} />
            <label htmlFor="sampleCount">How many samples will you test?</label>
            <input id="sampleCount" type="number" min={1} max={50} value={sampleCount} required
              onChange={e => { setSampleCount(Number(e.target.value)); setError(""); }} />
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions">
              <button type="submit">Next</button>
              <button type="button" onClick={onClose}>Cancel</button>
            </div>
          </form>
        )}
        {step === 2 && (
          <div>
            <div className="step-indicator">Step 2 of 2 — Sample details ({sampleCount} sample{sampleCount > 1 ? "s" : ""})</div>
            <div className="samples-grid">
              {samples.map((sample, i) => (
                <div key={i} className="sample-entry">
                  <p className="sample-entry-title">Sample {i + 1}</p>
                  <label htmlFor={`sampleName-${i}`}>Sample name</label>
                  <input id={`sampleName-${i}`} list="samples-list" value={sample.sampleName} required
                    placeholder="e.g. River A" onChange={e => updateSample(i, "sampleName", e.target.value)} />
                  <label htmlFor={`region-${i}`}>Region</label>
                  <input id={`region-${i}`} list="regions-list" value={sample.region} required
                    placeholder="e.g. North" onChange={e => updateSample(i, "region", e.target.value)} />
                </div>
              ))}
            </div>
            <datalist id="samples-list">{previousSamples.map((s, i) => <option key={i} value={s} />)}</datalist>
            <datalist id="regions-list">{previousRegions.map((r, i) => <option key={i} value={r} />)}</datalist>
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions-column">
              <div className="modal-actions-row">
                <button type="button" onClick={() => saveAndNavigate(false)} disabled={saving}>
                  {saving ? "Saving…" : "Start Measurement"}
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