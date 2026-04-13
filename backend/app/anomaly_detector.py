"""
Anomaly detection for water quality readings.
Uses Isolation Forest — no training data needed.
Also applies WHO threshold rules as a second layer.
"""
from __future__ import annotations
from typing import List, Dict, Optional
import numpy as np

# WHO / standard thresholds
THRESHOLDS = {
    "pH":              {"min": 6.5,  "max": 8.5,  "unit": ""},
    "Temperature (C)": {"min": 10.0, "max": 35.0, "unit": "°C"},
    "Turbidity (NTU)": {"min": 0.0,  "max": 5.0,  "unit": " NTU"},
    "TDS (ppm)":       {"min": 0.0,  "max": 500.0,"unit": " ppm"},
    "Conductivity":    {"min": 0.0,  "max": 1000.0,"unit": " µS"},
}

SEVERITY_COLORS = {
    "critical": "#DF6E5B",
    "warning":  "#FCC055",
    "info":     "#4FB1A1",
}

def detect_anomalies(readings: List[Dict]) -> List[Dict]:
    """
    readings: list of {parameter, value, sample_name, recorded_at}
    returns: list of anomaly messages
    """
    if not readings:
        return []

    messages = []

    # Group by parameter
    by_param: Dict[str, List] = {}
    for r in readings:
        p = r.get("parameter", "")
        if p not in by_param:
            by_param[p] = []
        by_param[p].append(r)

    for param, recs in by_param.items():
        values = [float(r["value"]) for r in recs]
        thresh = THRESHOLDS.get(param)

        # Layer 1 — WHO threshold violations
        for r in recs:
            v = float(r["value"])
            sample = r.get("sampleName") or r.get("sample_name") or "Unknown"
            unit = thresh["unit"] if thresh else ""

            if thresh:
                if v < thresh["min"]:
                    gap = thresh["min"] - v
                    severity = "critical" if gap > (thresh["min"] * 0.2 + 0.5) else "warning"
                    messages.append({
                        "severity": severity,
                        "parameter": param,
                        "sample": sample,
                        "message": f"{param} too low in {sample}: {v}{unit} (safe min: {thresh['min']}{unit})",
                    })
                elif v > thresh["max"]:
                    gap = v - thresh["max"]
                    severity = "critical" if gap > (thresh["max"] * 0.2 + 0.5) else "warning"
                    messages.append({
                        "severity": severity,
                        "parameter": param,
                        "sample": sample,
                        "message": f"{param} too high in {sample}: {v}{unit} (safe max: {thresh['max']}{unit})",
                    })

        # Layer 2 — Isolation Forest statistical anomaly (only if >= 4 readings)
        if len(values) >= 4:
            try:
                from sklearn.ensemble import IsolationForest
                X = np.array(values).reshape(-1, 1)
                contamination = min(0.3, max(0.05, 1 / len(values)))
                clf = IsolationForest(contamination=contamination, random_state=42)
                preds = clf.fit_predict(X)  # -1 = anomaly, 1 = normal
                scores = clf.decision_function(X)

                for i, (pred, score) in enumerate(zip(preds, scores)):
                    if pred == -1:
                        r = recs[i]
                        v = float(r["value"])
                        sample = r.get("sampleName") or r.get("sample_name") or "Unknown"
                        unit = thresh["unit"] if thresh else ""
                        mean_val = float(np.mean(values))

                        # Only report if not already caught by threshold check
                        already_flagged = any(
                            m["parameter"] == param and m["sample"] == sample
                            for m in messages
                        )
                        if not already_flagged:
                            direction = "above" if v > mean_val else "below"
                            messages.append({
                                "severity": "warning",
                                "parameter": param,
                                "sample": sample,
                                "message": f"Unusual {param} reading in {sample}: {v}{unit} is statistically {direction} normal range for this dataset",
                            })
            except Exception as e:
                print(f"[anomaly] IsolationForest error: {e}")

    # Deduplicate messages
    seen = set()
    unique = []
    for m in messages:
        key = m["message"]
        if key not in seen:
            seen.add(key)
            unique.append(m)

    # Sort: critical first, then warning, then info
    order = {"critical": 0, "warning": 1, "info": 2}
    unique.sort(key=lambda m: order.get(m["severity"], 3))

    return unique
