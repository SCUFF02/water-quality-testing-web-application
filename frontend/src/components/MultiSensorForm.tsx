import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface Props {
  onClose: () => void;
  projects: string[];
}

export default function MultiSensorForm({ onClose, projects }: Props) {
  const nav = useNavigate();

  const previousSamples = ["River A", "Lake B", "Station 3"];
  const previousRegions = ["North", "South", "Central"];

  const [projectName, setProjectName] = useState("");
  const [sampleName, setSampleName] = useState("");
  const [region, setRegion] = useState("");
  const [error, setError] = useState("");

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

    setError("");

    const savedProject = {
      userId: "user",
      projectName: trimmedProjectName,
      systemType: "multisensor",
      timestamp: new Date().toISOString(),
      formData: {
        sampleName,
        region,
      },
      manualData: [],
      collectedData: [],
    };

    const existingProjects = JSON.parse(
      localStorage.getItem("savedProjects") || "[]"
    );

    existingProjects.push(savedProject);
    localStorage.setItem("savedProjects", JSON.stringify(existingProjects));

    // removed console.log

    onClose();
    nav(`/project/${encodeURIComponent(trimmedProjectName)}`);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>MultiSensor System</h3>

        <form onSubmit={submit}>
          <label htmlFor="projectName">Project name</label>
          <input
            id="projectName"
            value={projectName}
            required
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Enter project name"
          />

          <label htmlFor="sampleName">Sample name</label>
          <input
            id="sampleName"
            list="samples"
            value={sampleName}
            required
            onChange={(e) => setSampleName(e.target.value)}
          />

          <datalist id="samples">
            {previousSamples.map((sample, i) => (
              <option key={i} value={sample} />
            ))}
          </datalist>

          <label htmlFor="region">Region</label>
          <input
            id="region"
            list="regions"
            value={region}
            required
            onChange={(e) => setRegion(e.target.value)}
          />

          <datalist id="regions">
            {previousRegions.map((item, i) => (
              <option key={i} value={item} />
            ))}
          </datalist>

          {error && <p className="form-error">{error}</p>}

          <div className="modal-actions">
            <button type="submit">Start Measurement</button>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}