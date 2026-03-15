import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface Props {
  onClose: () => void;
  projects: string[];
}

type SampleEntry = {
  sampleName: string;
  region: string;
};

/**
 * MultiSensor project creation form.
 *
 * What happens when user clicks "Start Measurement" or "Manual Input Only":
 * 1. Saves project to localStorage (so the app works immediately)
 * 2. If connected to backend: also saves to the database and stores the real DB id
 *    as backendId in localStorage — this backendId is used for MQTT start/stop calls
 */
export default function MultiSensorForm({ onClose, projects }: Props) {
  const nav = useNavigate();

  const currentUsername: string = (() => {
    try { return JSON.parse(localStorage.getItem("currentUser") || "{}").username || "user"; }
    catch { return "user"; }
  })();

  const previousSamples = ["River A", "Lake B", "Station 3"];
  const previousRegions = ["North", "South", "Central"];

  const [step, setStep]             = useState<1 | 2>(1);
  const [projectName, setProjectName] = useState("");
  const [sampleCount, setSampleCount] = useState<number>(1);
  const [error, setError]           = useState("");
  const [samples, setSamples]       = useState<SampleEntry[]>([]);

  function updateSample(index: number, field: keyof SampleEntry, value: string) {
    const next = [...samples];
    next[index] = { ...next[index], [field]: value };
    setSamples(next);
  }

  function goToStep2(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmedProjectName = projectName.trim();
    if (!trimmedProjectName) { setError("Project name is required."); return; }
    const duplicateProject = projects.some(
      (p) => p.trim().toLowerCase() === trimmedProjectName.toLowerCase()
    );
    if (duplicateProject) { setError("This project name already exists."); return; }
    if (sampleCount < 1 || sampleCount > 50) { setError("Number of samples must be between 1 and 50."); return; }
    setError("");
    setSamples(Array.from({ length: sampleCount }, () => ({ sampleName: "", region: "" })));
    setStep(2);
  }

  function validateSamples(): boolean {
    const incomplete = samples.some((s) => !s.sampleName.trim() || !s.region.trim());
    if (incomplete) { setError("Please fill in all sample names and regions."); return false; }
    setError("");
    return true;
  }

  async function saveAndNavigate(manualOnly: boolean) {
    if (!validateSamples()) return;

    const savedProject = {
      userId:      currentUsername,
      projectName: projectName.trim(),
      systemType:  "multisensor",
      timestamp:   new Date().toISOString(),
      formData:    { samples, manualOnly },
      manualData:  [],
      collectedData: [],
    };

    // Step 1: Save to localStorage immediately so the app works right away
    const existingProjects = JSON.parse(localStorage.getItem("savedProjects") || "[]");
    existingProjects.push(savedProject);
    localStorage.setItem("savedProjects", JSON.stringify(existingProjects));

    // Step 2: Also save to backend database (if backend is running)
    const token = localStorage.getItem("token");
    if (token) {
      try {
        const res = await fetch("http://localhost:8000/multisensor/projects", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({
            name:        projectName.trim(),
            system_type: "multisensor",
            manual_only: manualOnly,
            samples:     samples.map(s => ({ sample_name: s.sampleName, region: s.region })),
          }),
        });
        if (res.ok) {
          const data = await res.json();
          // Store the real database ID alongside the localStorage project
          // We need this ID later to send MQTT start/stop commands
          const all = JSON.parse(localStorage.getItem("savedProjects") || "[]");
          const idx = all.findIndex((p: any) => p.projectName === projectName.trim());
          if (idx !== -1) {
            all[idx].backendId = data.id;
            localStorage.setItem("savedProjects", JSON.stringify(all));
          }
        }
      } catch {
        // Backend not running — that's okay, localStorage version still works
        console.log("[MultiSensorForm] Backend not reachable — saved to localStorage only");
      }
    }

    onClose();
    nav(`/project/${encodeURIComponent(projectName.trim())}`);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <h3>MultiSensor System</h3>

        {step === 1 && (
          <form onSubmit={goToStep2}>
            <div className="step-indicator">Step 1 of 2 — Project setup</div>
            <label htmlFor="projectName">Project name</label>
            <input id="projectName" value={projectName} required
              onChange={(e) => { setProjectName(e.target.value); setError(""); }}
              placeholder="Enter project name" />
            <label htmlFor="sampleCount">How many samples will you test?</label>
            <input id="sampleCount" type="number" min={1} max={50} value={sampleCount} required
              onChange={(e) => { setSampleCount(Number(e.target.value)); setError(""); }} />
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions">
              <button type="submit">Next</button>
              <button type="button" onClick={onClose}>Cancel</button>
            </div>
          </form>
        )}

        {step === 2 && (
          <div>
            <div className="step-indicator">
              Step 2 of 2 — Sample details ({sampleCount} sample{sampleCount > 1 ? "s" : ""})
            </div>
            <div className="samples-grid">
              {samples.map((sample, i) => (
                <div key={i} className="sample-entry">
                  <p className="sample-entry-title">Sample {i + 1}</p>
                  <label htmlFor={`sampleName-${i}`}>Sample name</label>
                  <input id={`sampleName-${i}`} list="samples-list" value={sample.sampleName} required
                    placeholder="e.g. River A"
                    onChange={(e) => updateSample(i, "sampleName", e.target.value)} />
                  <label htmlFor={`region-${i}`}>Region</label>
                  <input id={`region-${i}`} list="regions-list" value={sample.region} required
                    placeholder="e.g. North"
                    onChange={(e) => updateSample(i, "region", e.target.value)} />
                </div>
              ))}
            </div>
            <datalist id="samples-list">
              {previousSamples.map((s, i) => <option key={i} value={s} />)}
            </datalist>
            <datalist id="regions-list">
              {previousRegions.map((r, i) => <option key={i} value={r} />)}
            </datalist>
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions-column">
              <div className="modal-actions-row">
                <button type="button" onClick={() => saveAndNavigate(false)}>Start Measurement</button>
                <button type="button" onClick={() => saveAndNavigate(true)} className="btn-secondary">Manual Input Only</button>
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