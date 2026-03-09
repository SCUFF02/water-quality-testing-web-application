import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

type DataPoint = {
  x: number;
  y: number;
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

export default function ProjectDataPage() {
  const { projectName } = useParams();
  const nav = useNavigate();
  const decodedName = decodeURIComponent(projectName || "");

  const project = useMemo(() => {
    const savedProjects: SavedProject[] = JSON.parse(
      localStorage.getItem("savedProjects") || "[]"
    );
    return savedProjects.find((item) => item.projectName === decodedName);
  }, [decodedName]);

  const [manualValue, setManualValue] = useState("");
  const [manualData, setManualData] = useState<DataPoint[]>(
    project?.manualData || []
  );
  const [collectedData, setCollectedData] = useState<DataPoint[]>(
    project?.collectedData || []
  );

  function updateProject(updatedFields: Partial<SavedProject>) {
    const allProjects: SavedProject[] = JSON.parse(
      localStorage.getItem("savedProjects") || "[]"
    );
    const updatedProjects = allProjects.map((item) =>
      item.projectName === decodedName ? { ...item, ...updatedFields } : item
    );
    localStorage.setItem("savedProjects", JSON.stringify(updatedProjects));
  }

  function connectSystem() {
    window.alert("System connected.");
  }

  function startCollecting() {
    const nextPoint = {
      x: collectedData.length + 1,
      y: Math.floor(Math.random() * 100),
    };
    const updated = [...collectedData, nextPoint];
    setCollectedData(updated);
    updateProject({ collectedData: updated, manualData });
  }

  function addManualData() {
    const value = Number(manualValue);
    if (Number.isNaN(value) || manualValue.trim() === "") return;
    const nextPoint = {
      x: manualData.length + 1,
      y: value,
    };
    const updated = [...manualData, nextPoint];
    setManualData(updated);
    setManualValue("");
    updateProject({ collectedData, manualData: updated });
  }

  function exportData(format: "json" | "csv") {
    if (!project) return;
    const exportObject = { ...project, manualData, collectedData };

    if (format === "json") {
      const blob = new Blob([JSON.stringify(exportObject, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${decodedName}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }

    if (format === "csv") {
      const rows = [
        ["type", "x", "y"],
        ...collectedData.map((p) => ["collected", String(p.x), String(p.y)]),
        ...manualData.map((p) => ["manual", String(p.x), String(p.y)]),
      ];
      const csv = rows.map((row) => row.join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${decodedName}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  if (!project) {
    return (
      <div style={{ padding: "2rem" }}>
        <h2>Project not found</h2>
        <p>Check that the project was saved before opening this page.</p>
        <button type="button" onClick={() => nav("/app")}>
          ← Back to Dashboard
        </button>
      </div>
    );
  }

  const quality = collectedData.length
    ? collectedData[collectedData.length - 1].y
    : 0;

  const maxY = 100;

  return (
    <div className="project-data-page">

      {/* TOPBAR */}
      <div className="project-page-topbar">
        <div className="project-page-topbar-left">
          <button
            type="button"
            className="back-btn"
            onClick={() => nav("/app")}
          >
            ← Back
          </button>
          <h1>{decodedName}</h1>
        </div>
        <div className="export-actions">
          <button type="button" onClick={() => exportData("json")}>
            Export JSON
          </button>
          <button type="button" onClick={() => exportData("csv")}>
            Export CSV
          </button>
        </div>
      </div>

      <div className="project-layout">
        <aside className="project-sidebar">
          <button type="button" onClick={connectSystem}>
            Connect to system
          </button>
          <button type="button" onClick={startCollecting}>
            Start collecting data
          </button>
          <div className="manual-data-box">
            <input
              type="number"
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              placeholder="Manual value"
            />
            <button type="button" onClick={addManualData}>
              Add manual data
            </button>
          </div>
        </aside>

        <main className="project-main">
          {/* COLLECTED DATA CHART */}
          <div className="graph-card">
            <h2>Collected data</h2>
            {collectedData.length === 0 ? (
              <p className="no-data">No data yet. Click "Start collecting data".</p>
            ) : (
              <div className="bar-chart">
                {collectedData.map((point) => (
                  <div key={point.x} className="bar-col">
                    <span className="bar-label">{point.y}</span>
                    <div
                      className="bar"
                      style={{ height: `${(point.y / maxY) * 100}%` }}
                    />
                    <span className="bar-x">{point.x}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* MANUAL DATA CHART */}
          <div className="graph-card">
            <h2>Manual data</h2>
            {manualData.length === 0 ? (
              <p className="no-data">No data yet. Enter a value and click "Add manual data".</p>
            ) : (
              <div className="bar-chart">
                {manualData.map((point) => (
                  <div key={point.x} className="bar-col">
                    <span className="bar-label">{point.y}</span>
                    <div
                      className="bar"
                      style={{
                        height: `${(Math.abs(point.y) / maxY) * 100}%`,
                        background: "var(--primary-dark)",
                      }}
                    />
                    <span className="bar-x">{point.x}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* WATER QUALITY */}
          <div className="quality-card">
            <h2>Water quality</h2>
            <div className="quality-bar">
              <div
                className="quality-fill"
                style={{ width: `${Math.min(quality, 100)}%` }}
              />
            </div>
            <p>Quality score: {quality}/100</p>
          </div>
        </main>
      </div>
    </div>
  );
}