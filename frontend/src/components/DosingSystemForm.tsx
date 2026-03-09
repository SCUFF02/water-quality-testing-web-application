import { useState } from "react";
import { useNavigate } from "react-router-dom";

type Props = {
  onClose: () => void;
  projects: string[];
};

export default function DosingSystemForm({ onClose, projects }: Props) {
  const nav = useNavigate();

  const previousSources = ["Well A", "Tank B", "River"];

  const [projectName, setProjectName] = useState("");
  const [sources, setSources] = useState<string[]>(
    Array.from({ length: 10 }, () => "")
  );
  const [liquid, setLiquid] = useState("");
  const [concentration, setConcentration] = useState("");
  const [error, setError] = useState("");

  function updateSource(index: number, value: string) {
    const next = [...sources];
    next[index] = value;

    const normalized = next
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    const hasDuplicate = normalized.some(
      (item, i) => normalized.indexOf(item) !== i
    );

    if (hasDuplicate) {
      setError("Source names must be unique.");
    } else {
      setError("");
    }

    setSources(next);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const trimmedProjectName = projectName.trim();

    if (!trimmedProjectName) {
      setError("Project name is required.");
      return;
    }

    const duplicateProject = projects.some(
      (project) =>
        project.trim().toLowerCase() === trimmedProjectName.toLowerCase()
    );

    if (duplicateProject) {
      setError("This project name already exists.");
      return;
    }

    const normalizedSources = sources
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    const hasDuplicateSources = normalizedSources.some(
      (item, i) => normalizedSources.indexOf(item) !== i
    );

    if (hasDuplicateSources) {
      setError("Source names must be unique.");
      return;
    }

    setError("");

    const savedProject = {
      userId: "user",
      projectName: trimmedProjectName,
      systemType: "dosing",
      timestamp: new Date().toISOString(),
      formData: {
        sources,
        liquid,
        concentration,
      },
      manualData: [],
      collectedData: [],
    };

    const existingProjects = JSON.parse(
      localStorage.getItem("savedProjects") || "[]"
    );

    existingProjects.push(savedProject);

    localStorage.setItem("savedProjects", JSON.stringify(existingProjects));

    console.log("Dosing Data:", savedProject);

    onClose();
    nav(`/project/${encodeURIComponent(trimmedProjectName)}`);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <h3>Dosing System</h3>

        <form onSubmit={submit}>
          <label htmlFor="projectName">Project name</label>
          <input
            id="projectName"
            value={projectName}
            required
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Enter project name"
          />

          {sources.map((source, i) => (
            <div key={i}>
              <label htmlFor={`source-${i}`}>Sample {i + 1} source</label>
              <input
                id={`source-${i}`}
                list="sources-list"
                value={source}
                required
                onChange={(e) => updateSource(i, e.target.value)}
              />
            </div>
          ))}

          <datalist id="sources-list">
            {previousSources.map((source, i) => (
              <option key={i} value={source} />
            ))}
          </datalist>

          <label htmlFor="liquid">Dosing liquid</label>
          <input
            id="liquid"
            value={liquid}
            required
            onChange={(e) => setLiquid(e.target.value)}
          />

          <label htmlFor="concentration">Target concentration</label>
          <input
            id="concentration"
            value={concentration}
            required
            onChange={(e) => setConcentration(e.target.value)}
          />

          {error && <p className="form-error">{error}</p>}

          <div className="modal-actions">
            <button type="submit">Start Dosing</button>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}