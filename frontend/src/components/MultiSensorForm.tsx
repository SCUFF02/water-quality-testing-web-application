import { useState } from "react";
import { useNavigate } from "react-router-dom";

type Props = {
  onClose: () => void;
  projects: string[];
};

const PARAMETERS = ["pH", "Temperature (C)", "Turbidity (NTU)", "TDS (ppm)", "Conductivity"];
const LIQUIDS = ["Chlorine", "Alum", "Lime", "Ferric Sulfate", "Sodium Hypochlorite", "Hydrogen Peroxide", "Ozone", "Fluoride"];

/**
 * Dosing System project creation form.
 * Same pattern as MultiSensorForm — saves to localStorage then syncs to backend.
 */
export default function DosingSystemForm({ onClose, projects }: Props) {
  const nav = useNavigate();

  const currentUsername: string = (() => {
    try { return JSON.parse(localStorage.getItem("currentUser") || "{}").username || "user"; }
    catch { return "user"; }
  })();

  const previousSources = ["Well A", "Tank B", "River"];

  const [step, setStep]                   = useState<1 | 2>(1);
  const [projectName, setProjectName]     = useState("");
  const [sampleCount, setSampleCount]     = useState(1);
  const [selectedParams, setSelectedParams] = useState<string[]>([]);
  const [selectedLiquids, setSelectedLiquids] = useState<string[]>([]);
  const [sources, setSources]             = useState<string[]>(Array.from({ length: 10 }, () => ""));
  const [error, setError]                 = useState("");

  function toggleParam(name: string) {
    setSelectedParams((prev) => prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]);
    setError("");
  }

  function toggleLiquid(name: string) {
    setSelectedLiquids((prev) => prev.includes(name) ? prev.filter((l) => l !== name) : [...prev, name]);
    setError("");
  }

  function updateSource(index: number, value: string) {
    const next = [...sources];
    next[index] = value;
    const normalized = next.map((s) => s.trim().toLowerCase()).filter(Boolean);
    const hasDuplicate = normalized.some((s, i) => normalized.indexOf(s) !== i);
    setError(hasDuplicate ? "Source names must be unique." : "");
    setSources(next);
  }

  function goToStep2(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = projectName.trim();
    if (!trimmed) { setError("Project name is required."); return; }
    const duplicate = projects.some((p) => p.trim().toLowerCase() === trimmed.toLowerCase());
    if (duplicate) { setError("This project name already exists."); return; }
    if (sampleCount < 1 || sampleCount > 10) { setError("Number of sources must be between 1 and 10."); return; }
    if (selectedParams.length === 0) { setError("Select at least one parameter to monitor."); return; }
    if (selectedLiquids.length === 0) { setError("Select at least one dosing liquid."); return; }
    setError("");
    setStep(2);
  }

  function validate(): boolean {
    const activeSources = sources.slice(0, sampleCount);
    const emptySource = activeSources.some((s) => !s.trim());
    if (emptySource) { setError(`All ${sampleCount} source names are required.`); return false; }
    const normalized = activeSources.map((s) => s.trim().toLowerCase());
    const hasDuplicate = normalized.some((s, i) => normalized.indexOf(s) !== i);
    if (hasDuplicate) { setError("Source names must be unique."); return false; }
    setError("");
    return true;
  }

  async function saveAndNavigate(manualOnly: boolean) {
    if (!validate()) return;

    const activeSources = sources.slice(0, sampleCount);

    const savedProject = {
      userId:      currentUsername,
      projectName: projectName.trim(),
      systemType:  "dosing",
      timestamp:   new Date().toISOString(),
      formData: {
        sources: activeSources,
        parameters: selectedParams,
        liquids: selectedLiquids,
        manualOnly,
      },
      manualData:    [],
      collectedData: [],
    };

    // Step 1: Save to localStorage immediately
    const existingProjects = JSON.parse(localStorage.getItem("savedProjects") || "[]");
    existingProjects.push(savedProject);
    localStorage.setItem("savedProjects", JSON.stringify(existingProjects));

    // Step 2: Sync to backend database
    const token = localStorage.getItem("token");
    if (token) {
      try {
        const res = await fetch("http://localhost:8000/dosing/projects", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({
            name:        projectName.trim(),
            system_type: "dosing",
            manual_only: manualOnly,
            // Send sources as samples so the DB stores them
            samples: activeSources.map(s => ({ sample_name: s, region: "" })),
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const all = JSON.parse(localStorage.getItem("savedProjects") || "[]");
          const idx = all.findIndex((p: any) => p.projectName === projectName.trim());
          if (idx !== -1) {
            all[idx].backendId = data.id;
            localStorage.setItem("savedProjects", JSON.stringify(all));
          }
        }
      } catch {
        console.log("[DosingSystemForm] Backend not reachable — saved to localStorage only");
      }
    }

    onClose();
    nav(`/project/${encodeURIComponent(projectName.trim())}`);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <h3>Dosing System</h3>

        {step === 1 && (
          <form onSubmit={goToStep2}>
            <div className="step-indicator">Step 1 of 2 — Project setup</div>
            <label htmlFor="projectName">Project name</label>
            <input id="projectName" value={projectName} required placeholder="Enter project name"
              onChange={(e) => { setProjectName(e.target.value); setError(""); }} />
            <label htmlFor="sampleCount">Number of sources (1–10)</label>
            <input id="sampleCount" type="number" min={1} max={10} value={sampleCount} required
              onChange={(e) => { setSampleCount(Number(e.target.value)); setError(""); }} />
            <p className="param-section-label">Parameters to monitor</p>
            <div className="param-toggle-grid">
              {PARAMETERS.map((p) => (
                <button key={p} type="button"
                  className={`param-toggle${selectedParams.includes(p) ? " param-toggle-active" : ""}`}
                  onClick={() => toggleParam(p)}>{p}</button>
              ))}
            </div>
            <p className="param-section-label" style={{ marginTop: 16 }}>Dosing liquids</p>
            <div className="param-toggle-grid">
              {LIQUIDS.map((l) => (
                <button key={l} type="button"
                  className={`param-toggle${selectedLiquids.includes(l) ? " param-toggle-active param-toggle-liquid" : ""}`}
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
                    placeholder="e.g. Well A" maxLength={18}
                    onChange={(e) => updateSource(i, e.target.value)} />
                </div>
              ))}
            </div>
            <datalist id="sources-list">
              {previousSources.map((s, i) => <option key={i} value={s} />)}
            </datalist>
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions-column">
              <div className="modal-actions-row">
                <button type="button" onClick={() => saveAndNavigate(false)}>Start Dosing</button>
                <button type="button" className="btn-secondary" onClick={() => saveAndNavigate(true)}>Manual Input Only</button>
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