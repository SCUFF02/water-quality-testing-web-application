import { useState } from "react";

type Props = {
  onClose: () => void;
};

export default function DosingSystemForm({ onClose }: Props) {
  const previousSources = ["Well A", "Tank B", "River"];
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

    const normalized = sources
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    const hasDuplicate = normalized.some(
      (item, i) => normalized.indexOf(item) !== i
    );

    if (hasDuplicate) {
      setError("Source names must be unique.");
      return;
    }

    const data = {
      sources,
      liquid,
      concentration,
    };

    console.log("Dosing Data:", data);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <h3>Dosing System</h3>

        <form onSubmit={submit}>
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