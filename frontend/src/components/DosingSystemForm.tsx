import { useState } from "react";
import { useNavigate } from "react-router-dom";

type Props = {
  onClose: () => void;
  projects: string[];
};

type ParameterTarget = {
  name: string;
  target: string;
  unit: string;
};

const AVAILABLE_PARAMETERS: { name: string; unit: string; placeholder: string }[] = [
  { name: "pH",               unit: "",       placeholder: "e.g. 7.0" },
  { name: "Turbidity",        unit: "NTU",    placeholder: "e.g. 5" },
  { name: "TDS",              unit: "ppm",    placeholder: "e.g. 500" },
  { name: "Temperature",      unit: "°C",     placeholder: "e.g. 25" },
  { name: "Conductivity",     unit: "µS/cm",  placeholder: "e.g. 400" },
  { name: "Dissolved Oxygen", unit: "mg/L",   placeholder: "e.g. 8" },
  { name: "Chlorine",         unit: "mg/L",   placeholder: "e.g. 0.5" },
  { name: "Nitrates",         unit: "mg/L",   placeholder: "e.g. 10" },
];

export default function DosingSystemForm({ onClose, projects }: Props) {
  const nav = useNavigate();

  const previousSources = ["Well A", "Tank B", "River"];

  const [step, setStep]               = useState<1 | 2>(1);
  const [projectName, setProjectName] = useState("");
  const [selectedParams, setSelectedParams] = useState<string[]>([]);
  const [paramTargets, setParamTargets]     = useState<Record<string, string>>({});
  const [sources, setSources] = useState<string[]>(
    Array.from({ length: 10 }, () => "")
  );
  const [error, setError] = useState("");

  function isSelected(name: string) {
    return selectedParams.includes(name);
  }

  function toggleParam(name: string) {
    setSelectedParams((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    );
    setError("");
  }

  function setTarget(name: string, value: string) {
    setParamTargets((prev) => ({ ...prev, [name]: value }));
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

    const duplicate = projects.some(
      (p) => p.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) { setError("This project name already exists."); return; }

    if (selectedParams.length === 0) {
      setError("Select at least one parameter to monitor.");
      return;
    }

    const missingTarget = selectedParams.some((p) => !paramTargets[p]?.trim());
    if (missingTarget) {
      setError("Please enter a target value for each selected parameter.");
      return;
    }

    setError("");
    setStep(2);
  }

  function validate(): boolean {
    const emptySource = sources.some((s) => !s.trim());
    if (emptySource) { setError("All 10 source names are required."); return false; }

    const normalized = sources.map((s) => s.trim().toLowerCase());
    const hasDuplicate = normalized.some((s, i) => normalized.indexOf(s) !== i);
    if (hasDuplicate) { setError("Source names must be unique."); return false; }

    setError("");
    return true;
  }

  function saveAndNavigate(manualOnly: boolean) {
    if (!validate()) return;

    const parameters: ParameterTarget[] = selectedParams.map((name) => {
      const meta = AVAILABLE_PARAMETERS.find((p) => p.name === name)!;
      return { name, target: paramTargets[name] || "", unit: meta.unit };
    });

    const savedProject = {
      userId: "user",
      projectName: projectName.trim(),
      systemType: "dosing",
      timestamp: new Date().toISOString(),
      formData: { sources, parameters, manualOnly },
      manualData: [],
      collectedData: [],
    };

    const existingProjects = JSON.parse(localStorage.getItem("savedProjects") || "[]");
    existingProjects.push(savedProject);
    localStorage.setItem("savedProjects", JSON.stringify(existingProjects));

    onClose();
    nav(`/project/${encodeURIComponent(projectName.trim())}`);
  }

  const selectedParamList = AVAILABLE_PARAMETERS.filter((p) => isSelected(p.name));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <h3>Dosing System</h3>

        {/* STEP 1 */}
        {step === 1 && (
          <form onSubmit={goToStep2}>
            <div className="step-indicator">Step 1 of 2 — Project setup</div>

            <label htmlFor="projectName">Project name</label>
            <input
              id="projectName"
              value={projectName}
              required
              placeholder="Enter project name"
              onChange={(e) => { setProjectName(e.target.value); setError(""); }}
            />

            <p className="param-section-label">Parameters to monitor</p>
            <div className="param-toggle-grid">
              {AVAILABLE_PARAMETERS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  className={`param-toggle${isSelected(p.name) ? " param-toggle-active" : ""}`}
                  onClick={() => toggleParam(p.name)}
                >
                  {p.name}
                  {p.unit && <span className="param-unit"> ({p.unit})</span>}
                </button>
              ))}
            </div>

            {selectedParamList.length > 0 && (
              <>
                <p className="param-section-label" style={{ marginTop: 16 }}>
                  Target values
                </p>
                <div className="param-targets-grid">
                  {selectedParamList.map((p) => (
                    <div key={p.name} className="param-target-row">
                      <label htmlFor={`target-${p.name}`}>
                        {p.name}{p.unit ? ` (${p.unit})` : ""}
                      </label>
                      <input
                        id={`target-${p.name}`}
                        type="number"
                        step="any"
                        value={paramTargets[p.name] || ""}
                        placeholder={p.placeholder}
                        required
                        onChange={(e) => setTarget(p.name, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}

            {error && <p className="form-error">{error}</p>}

            <div className="modal-actions">
              <button type="submit">Next</button>
              <button type="button" onClick={onClose}>Cancel</button>
            </div>
          </form>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div>
            <div className="step-indicator">Step 2 of 2 — Sources (10 required)</div>

            <div className="samples-grid">
              {sources.map((source, i) => (
                <div key={i} className="sample-entry">
                  <p className="sample-entry-title">Source {i + 1}</p>
                  <label htmlFor={`source-${i}`}>Source name</label>
                  <input
                    id={`source-${i}`}
                    list="sources-list"
                    value={source}
                    required
                    placeholder="e.g. Well A"
                    onChange={(e) => updateSource(i, e.target.value)}
                  />
                </div>
              ))}
            </div>

            <datalist id="sources-list">
              {previousSources.map((s, i) => <option key={i} value={s} />)}
            </datalist>

            {error && <p className="form-error">{error}</p>}

            <div className="modal-actions-column">
              <div className="modal-actions-row">
                <button type="button" onClick={() => saveAndNavigate(false)}>
                  Start Dosing
                </button>
                <button type="button" className="btn-secondary" onClick={() => saveAndNavigate(true)}>
                  Manual Input Only
                </button>
              </div>
              <div className="modal-actions-row">
                <button type="button" className="btn-ghost" onClick={() => { setStep(1); setError(""); }}>
                  Back
                </button>
                <button type="button" className="btn-ghost" onClick={onClose}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
