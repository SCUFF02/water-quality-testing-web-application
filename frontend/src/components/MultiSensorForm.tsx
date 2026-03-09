import { useState } from "react";

interface Props {
  onClose: () => void;
}

export default function MultiSensorForm({ onClose }: Props) {
  const previousSamples = ["River A", "Lake B", "Station 3"];
  const previousRegions = ["North", "South", "Central"];

  const [sampleName, setSampleName] = useState("");
  const [region, setRegion] = useState("");

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const data = {
      sampleName,
      region,
    };

    console.log("MultiSensor Data:", data);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>MultiSensor System</h3>

        <form onSubmit={submit}>
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