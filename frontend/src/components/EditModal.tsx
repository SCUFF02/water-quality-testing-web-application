import { useState } from "react";

interface EditModalProps {
  title: string;
  fields: { id: string; label: string; type?: string; defaultValue: string; maxLength?: number; placeholder?: string }[];
  onSave: (values: Record<string, string>) => void | Promise<void>;
  onClose: () => void;
  saveLabel?: string;
  error?: string;
}

export function EditModal({ title, fields, onSave, onClose, saveLabel = "Save", error }: EditModalProps) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map(f => [f.id, f.defaultValue]))
  );

  async function handleSave() {
    await onSave(values);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        {fields.map(f => (
          <div key={f.id}>
            <label htmlFor={f.id}>{f.label}</label>
            <input
              id={f.id}
              type={f.type || "text"}
              value={values[f.id]}
              maxLength={f.maxLength}
              placeholder={f.placeholder}
              autoFocus={f.id === fields[0].id}
              onChange={e => setValues(v => ({ ...v, [f.id]: e.target.value }))}
              onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
            />
          </div>
        ))}
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button type="button" onClick={handleSave}>{saveLabel}</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

interface ConfirmModalProps {
  title: string;
  message: React.ReactNode;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  confirmLabel?: string;
  danger?: boolean;
}

export function ConfirmModal({ title, message, onConfirm, onClose, confirmLabel = "Confirm", danger = false }: ConfirmModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        <p style={{ textAlign: "center", color: "var(--ink-2)", fontSize: 13, margin: "0 0 20px" }}>{message}</p>
        <div className="modal-actions">
          <button type="button"
            style={danger ? { background: "var(--danger)", borderColor: "var(--danger)", color: "#fff" } : {}}
            onClick={onConfirm}>{confirmLabel}</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
