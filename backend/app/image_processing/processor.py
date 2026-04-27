"""
Dosing image processor — burette volume reader.

Input:  path to a JPEG from ESP-CAM
Output: dict → volume_ml, moles, concentration

Pipeline (strict burette detection):
1. Load image with OpenCV
2. Detect tube walls via gradient analysis
3. Fit tube model (left/right wall lines)
4. Build central ROI inside the tube
5. Auto-calibrate scale from graduation marks
6. Detect meniscus position via visual scoring
7. Compute volume from meniscus position
8. Calculate moles = concentration × volume_in_litres
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np

# ── Liquid properties ─────────────────────────────────────────────────────────
LIQUID_PROPERTIES = {
    "Chlorine":            {"molar_mass": 70.9,   "concentration": 0.05},
    "Alum":                {"molar_mass": 342.15, "concentration": 0.10},
    "Lime":                {"molar_mass": 74.09,  "concentration": 0.05},
    "Ferric Sulfate":      {"molar_mass": 399.88, "concentration": 0.08},
    "Sodium Hypochlorite": {"molar_mass": 74.44,  "concentration": 0.10},
    "Hydrogen Peroxide":   {"molar_mass": 34.01,  "concentration": 0.30},
    "Ozone":               {"molar_mass": 48.0,   "concentration": 0.02},
    "Fluoride":            {"molar_mass": 41.99,  "concentration": 0.10},
}

# ── Fixed calibration defaults ────────────────────────────────────────────────
Y0_REFERENCE_PX        = 151.5
PX_PER_ML_FIXED        = 44.0
MM_PER_ML_REFERENCE    = 4.0
MAX_VOLUME_ML          = 25.0

# ── Detection parameters ──────────────────────────────────────────────────────
EXPECTED_WIDTH_RANGE_PX   = (14.0, 40.0)
CENTER_ROI_WIDTH_FRACTION = 0.22
PROFILE_SMOOTH_WINDOW     = 15
PROFILE_SMOOTH_SIGMA      = 2.6
GRADIENT_SMOOTH_WINDOW    = 11
GRADIENT_SMOOTH_SIGMA     = 1.8
PEAK_EXCLUSION_PX         = 8
MAX_COLUMN_SPREAD_PX      = 4.5
SECOND_PEAK_RATIO_LIMIT   = 0.82
LOW_CONFIDENCE_THRESHOLD  = 0.45


@dataclass
class TubeModel:
    left_slope:     float
    left_intercept: float
    right_slope:    float
    right_intercept:float
    width_px:       float
    width_cv:       float
    rows_used:      int


def x_at_y(slope: float, intercept: float, y: float) -> float:
    return slope * y + intercept


def smooth_1d(signal: Sequence[float], window: int, sigma: float) -> np.ndarray:
    arr = np.asarray(signal, dtype=np.float32).reshape(-1, 1)
    ksize = max(3, window | 1)
    smoothed = cv2.GaussianBlur(arr, (1, ksize), sigmaX=0, sigmaY=sigma,
                                 borderType=cv2.BORDER_REPLICATE)
    return smoothed.reshape(-1)


def preprocess_image(image: np.ndarray) -> Dict[str, np.ndarray]:
    gray       = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    clahe      = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    contrast   = clahe.apply(gray)
    blur       = cv2.GaussianBlur(contrast, (5, 5), 0)
    background = cv2.morphologyEx(blur, cv2.MORPH_OPEN, np.ones((31, 31), np.uint8))
    normalized = cv2.normalize(cv2.subtract(blur, background), None, 0, 255,
                               cv2.NORM_MINMAX).astype(np.uint8)
    grad_x = cv2.Sobel(normalized, cv2.CV_32F, 1, 0, ksize=3)
    grad_y = cv2.Sobel(normalized, cv2.CV_32F, 0, 1, ksize=3)
    return {"gray": gray, "contrast": contrast, "blur": blur,
            "normalized": normalized, "grad_x": grad_x, "grad_y": grad_y}


def estimate_tube_roi(proc: Dict[str, np.ndarray]) -> Tuple[int, int]:
    normalized = proc["normalized"]
    edges = cv2.Canny(normalized, 35, 120)
    _, w = edges.shape
    col_strength = edges.sum(axis=0).astype(np.float32)
    col_strength[:int(0.20 * w)] = 0
    col_strength[int(0.80 * w):] = 0
    col_strength = smooth_1d(col_strength, 31, 5.0)
    peak = int(np.argmax(col_strength))
    if float(col_strength[peak]) <= 0:
        raise ValueError("tube_not_found")
    threshold = float(col_strength[peak]) * 0.30
    left, right = peak, peak
    while left > 1 and col_strength[left - 1] >= threshold:
        left -= 1
    while right < w - 2 and col_strength[right + 1] >= threshold:
        right += 1
    pad = max(10, (right - left) // 3)
    left  = max(0, left - pad)
    right = min(w - 1, right + pad)
    if right - left < 25:
        raise ValueError("tube_roi_too_narrow")
    return left, right


def fit_tube_model(proc: Dict[str, np.ndarray], roi_left: int, roi_right: int) -> TubeModel:
    grad_x = proc["grad_x"][:, roi_left:roi_right]
    h, w = grad_x.shape
    center = w // 2
    left_band  = grad_x[:, :center]
    right_band = grad_x[:, center:]
    ys: List[float] = []
    lefts: List[float] = []
    rights: List[float] = []
    widths: List[float] = []
    for y in range(25, h - 25, 2):
        left_row  = left_band[y]
        right_row = right_band[y]
        left_idx  = int(np.argmax(left_row))
        right_idx = int(np.argmin(right_row)) + center
        left_strength  = float(left_row[left_idx])
        right_strength = float(-right_row[right_idx - center])
        width = right_idx - left_idx
        if left_strength < 6 or right_strength < 6:
            continue
        if not (EXPECTED_WIDTH_RANGE_PX[0] <= width <= EXPECTED_WIDTH_RANGE_PX[1]):
            continue
        ys.append(float(y))
        lefts.append(float(roi_left + left_idx))
        rights.append(float(roi_left + right_idx))
        widths.append(float(width))
    if len(widths) < 25:
        raise ValueError("not_enough_wall_samples")
    width_median = float(np.median(widths))
    keep = [i for i, width in enumerate(widths)
            if abs(width - width_median) <= max(2.5, width_median * 0.12)]
    if len(keep) < 20:
        keep = list(range(len(widths)))
    ys_arr    = np.asarray([ys[i]     for i in keep], dtype=np.float32)
    left_arr  = np.asarray([lefts[i]  for i in keep], dtype=np.float32)
    right_arr = np.asarray([rights[i] for i in keep], dtype=np.float32)
    width_arr = right_arr - left_arr
    left_fit  = np.polyfit(ys_arr, left_arr,  1)
    right_fit = np.polyfit(ys_arr, right_arr, 1)
    return TubeModel(
        left_slope=float(left_fit[0]),   left_intercept=float(left_fit[1]),
        right_slope=float(right_fit[0]), right_intercept=float(right_fit[1]),
        width_px=float(np.median(width_arr)),
        width_cv=float(np.std(width_arr) / max(np.mean(width_arr), 1.0)),
        rows_used=len(keep),
    )


def build_center_roi(proc: Dict[str, np.ndarray], tube: TubeModel) -> Tuple[np.ndarray, Dict[str, int]]:
    normalized = proc["normalized"]
    h, _ = normalized.shape
    ys = [int(0.2 * h), int(0.5 * h), int(0.8 * h)]
    centers, widths = [], []
    for y in ys:
        left  = x_at_y(tube.left_slope,  tube.left_intercept,  y)
        right = x_at_y(tube.right_slope, tube.right_intercept, y)
        centers.append((left + right) / 2.0)
        widths.append(right - left)
    center_x    = int(round(float(np.median(centers))))
    tube_width  = int(round(float(np.median(widths))))
    roi_half    = max(4, int(round(tube_width * CENTER_ROI_WIDTH_FRACTION / 2.0)))
    x0 = max(0, center_x - roi_half)
    x1 = min(normalized.shape[1], center_x + roi_half)
    if x1 - x0 < 4:
        raise ValueError("center_roi_invalid")
    return normalized[:, x0:x1], {"x0": x0, "x1": x1, "center_x": center_x}


def detect_scale_calibration(proc: Dict[str, np.ndarray], tube: TubeModel) -> Dict[str, float]:
    grad_y = np.abs(proc["grad_y"])
    h, _ = grad_y.shape
    row_profile = np.zeros(h, dtype=np.float32)
    for y in range(10, h - 10):
        left  = int(round(x_at_y(tube.left_slope,  tube.left_intercept,  y))) + 2
        right = int(round(x_at_y(tube.right_slope, tube.right_intercept, y))) - 2
        if right - left < 8:
            continue
        row_profile[y] = float(np.mean(grad_y[y, left:right]))
    row_profile = smooth_1d(row_profile, 9, 2.2)
    search = row_profile[20:h - 20]
    if search.size < 40:
        raise ValueError("scale_profile_invalid")
    threshold = float(np.percentile(search, 82))
    peak_rows = [
        y for y in range(21, h - 21)
        if row_profile[y] >= threshold
        and row_profile[y] >= row_profile[y - 1]
        and row_profile[y] >= row_profile[y + 1]
    ]
    if len(peak_rows) < 8:
        raise ValueError("graduations_not_found")
    clusters: List[List[float]] = [[float(peak_rows[0])]]
    for value in peak_rows[1:]:
        if value - clusters[-1][-1] <= 4:
            clusters[-1].append(float(value))
        else:
            clusters.append([float(value)])
    lines = [float(np.mean(c)) for c in clusters]
    if len(lines) < 6:
        raise ValueError("graduation_lines_too_few")
    diffs = np.diff(lines).astype(np.float32)
    plausible = [float(d) for d in diffs
                 if 0.55 * PX_PER_ML_FIXED <= d <= 1.45 * PX_PER_ML_FIXED]
    if len(plausible) >= 3:
        px_per_ml = float(np.median(plausible))
    elif len(diffs) >= 3:
        px_per_ml = float(np.median(diffs))
    else:
        px_per_ml = PX_PER_ML_FIXED
    y0_candidates = [l for l in lines if abs(l - Y0_REFERENCE_PX) <= 60]
    y0_px = (min(y0_candidates, key=lambda y: abs(y - Y0_REFERENCE_PX))
             if y0_candidates else Y0_REFERENCE_PX)
    spacing_cv = (float(np.std(plausible) / max(np.mean(plausible), 1.0))
                  if len(plausible) >= 2 else 0.25)
    confidence  = 0.35
    confidence += 0.30 * max(0.0, 1.0 - min(spacing_cv, 0.30) / 0.30)
    confidence += 0.20 * min(1.0, len(lines) / 12.0)
    confidence += 0.15 * max(0.0, 1.0 - abs(px_per_ml - PX_PER_ML_FIXED) / PX_PER_ML_FIXED)
    return {
        "y0_px":      float(y0_px),
        "px_per_ml":  float(px_per_ml),
        "mm_per_px":  float(MM_PER_ML_REFERENCE / px_per_ml),
        "confidence": float(max(0.0, min(1.0, confidence))),
        "line_count": len(lines),
    }


def detect_meniscus_visual(center_roi: np.ndarray, proc: Dict[str, np.ndarray],
                           tube: TubeModel, y0_px: float,
                           px_per_ml: float) -> Dict[str, float]:
    roi = center_roi.astype(np.float32)
    h, w = roi.shape
    search_start = max(12, int(y0_px - 0.4 * px_per_ml))
    search_end   = min(h - 12, int(min(h - 12, y0_px + (MAX_VOLUME_ML + 0.8) * px_per_ml)))
    if search_end <= search_start + 20:
        raise ValueError("meniscus_search_invalid")
    clahe      = cv2.createCLAHE(clipLimit=3.5, tileGridSize=(8, 8))
    roi_uint8  = (np.clip(roi, 0, 255).astype(np.float32) / 255.0 * 255).astype(np.uint8)
    roi_enh    = clahe.apply(roi_uint8).astype(np.float32)
    kernel     = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 7))
    roi_clean  = cv2.morphologyEx(roi_enh.astype(np.uint8), cv2.MORPH_OPEN, kernel).astype(np.float32)
    grad_y     = cv2.Sobel(roi_clean, cv2.CV_32F, 0, 1, ksize=3)
    grad_x     = cv2.Sobel(roi_clean, cv2.CV_32F, 1, 0, ksize=3)
    score      = np.abs(grad_y) * 1.2 + np.abs(grad_x) * 0.4
    row_scores = score.mean(axis=1)
    smooth_rows = smooth_1d(row_scores, 15, 2.5)
    candidates: List[float] = []
    strength_vals: List[float] = []
    for col in range(1, w - 1):
        col_score = score[:, col]
        local     = col_score[search_start:search_end]
        if local.size == 0:
            continue
        peak_idx   = int(np.argmax(local))
        peak_value = float(local[peak_idx])
        if peak_value <= 1e-3:
            continue
        score_baseline = float(np.median(local) + 1e-6)
        if peak_value < score_baseline * 1.8:
            continue
        candidates.append(float(search_start + peak_idx))
        strength_vals.append(peak_value / score_baseline)
    if not candidates:
        raise ValueError("meniscus_not_found")
    candidates_arr = np.asarray(candidates, dtype=np.float32)
    meniscus_y     = float(np.percentile(candidates_arr, 85))
    col_spread     = float(np.percentile(np.abs(candidates_arr - np.median(candidates_arr)), 75))
    if col_spread > MAX_COLUMN_SPREAD_PX * 2:
        raise ValueError("meniscus_column_instability")
    strength_arr   = np.asarray(strength_vals, dtype=np.float32)
    strength_conf  = float(np.clip((np.median(strength_arr) - 1.0) / 4.0, 0.0, 1.0))
    consist_conf   = float(np.clip(1.0 - min(col_spread, 10.0) / 10.0, 0.0, 1.0))
    row_peak       = float(np.max(smooth_rows[search_start:search_end]))
    row_median     = float(np.median(smooth_rows[search_start:search_end]) + 1e-6)
    line_contrast  = float(np.clip((row_peak - row_median) / (row_median + 1e-6), 0.0, 1.0))
    confidence     = float(np.clip(0.4 * strength_conf + 0.4 * consist_conf + 0.2 * line_contrast, 0.0, 1.0))
    relative_ml    = (meniscus_y - y0_px) / px_per_ml
    if not (-0.5 <= relative_ml <= MAX_VOLUME_ML + 0.5):
        raise ValueError("volume_out_of_range")
    return {
        "meniscus_px":      float(meniscus_y),
        "relative_ml":      float(max(0.0, min(MAX_VOLUME_ML, relative_ml))),
        "confidence":       confidence,
        "column_spread_px": float(col_spread),
        "second_peak_ratio": float(np.median(strength_arr)),
    }


def compute_volume_from_scale(meniscus_y: float, y0_px: float, px_per_ml: float) -> float:
    volume = (meniscus_y - y0_px) / px_per_ml
    return float(max(0.0, min(MAX_VOLUME_ML, volume)))


# ── Main entry point — called by dosing router when ESP-CAM uploads image ─────
def process_dosing_image(image_path: str, liquid: str) -> Dict[str, Optional[float]]:
    """
    Called by the FastAPI dosing router after saving the ESP-CAM image.
    Returns volume_ml, moles, concentration — or None values if detection fails.
    """
    result: Dict[str, Optional[float]] = {
        "volume_ml":     None,
        "moles":         None,
        "concentration": None,
        "confidence":    None,
    }

    try:
        image = cv2.imread(image_path)
        if image is None:
            print(f"[processor] Could not read image: {image_path}")
            return result

        # Run the strict burette detection pipeline
        proc                     = preprocess_image(image)
        roi_left, roi_right      = estimate_tube_roi(proc)
        tube                     = fit_tube_model(proc, roi_left, roi_right)
        center_roi, _            = build_center_roi(proc, tube)
        calibration              = detect_scale_calibration(proc, tube)
        meniscus                 = detect_meniscus_visual(
                                       center_roi, proc, tube,
                                       calibration["y0_px"], calibration["px_per_ml"])
        volume_ml                = compute_volume_from_scale(
                                       meniscus["meniscus_px"],
                                       calibration["y0_px"],
                                       calibration["px_per_ml"])

        # Calculate moles from volume and liquid concentration
        props         = LIQUID_PROPERTIES.get(liquid, {"concentration": 0.1})
        concentration = props["concentration"]
        moles         = concentration * (volume_ml / 1000.0)

        result["volume_ml"]     = round(volume_ml, 3)
        result["moles"]         = round(moles, 6)
        result["concentration"] = concentration
        result["confidence"]    = round(meniscus["confidence"], 3)

        print(f"[processor] {liquid}: {volume_ml:.3f} mL, "
              f"{moles:.6f} mol, conf={meniscus['confidence']:.2f}")

    except ValueError as e:
        # Known failure modes from the detection pipeline
        print(f"[processor] Detection failed ({e}): {image_path}")
    except Exception as e:
        print(f"[processor] Unexpected error: {e}")

    return result


def process_dosing_pair(before_path: str, after_path: str, liquid: str) -> Dict[str, Optional[float]]:
    """
    Called when both before and after images are available.
    Volume dispensed = meniscus_before - meniscus_after (burette reads top-down).
    """
    result: Dict[str, Optional[float]] = {
        "volume_ml":     None,
        "moles":         None,
        "concentration": None,
        "confidence":    None,
    }

    try:
        def read_meniscus(image_path: str):
            image = cv2.imread(image_path)
            if image is None:
                raise ValueError(f"Could not read image: {image_path}")
            proc            = preprocess_image(image)
            roi_left, roi_right = estimate_tube_roi(proc)
            tube            = fit_tube_model(proc, roi_left, roi_right)
            center_roi, _   = build_center_roi(proc, tube)
            calibration     = detect_scale_calibration(proc, tube)
            meniscus        = detect_meniscus_visual(
                                  center_roi, proc, tube,
                                  calibration["y0_px"], calibration["px_per_ml"])
            volume          = compute_volume_from_scale(
                                  meniscus["meniscus_px"],
                                  calibration["y0_px"],
                                  calibration["px_per_ml"])
            return volume, meniscus["confidence"]

        vol_before, conf_before = read_meniscus(before_path)
        vol_after,  conf_after  = read_meniscus(after_path)

        # Volume dispensed is the drop in burette reading
        volume_ml = vol_after - vol_before
        if volume_ml < 0:
            volume_ml = abs(volume_ml)

        props         = LIQUID_PROPERTIES.get(liquid, {"concentration": 0.1})
        concentration = props["concentration"]
        moles         = concentration * (volume_ml / 1000.0)
        confidence    = round((conf_before + conf_after) / 2, 3)

        result["volume_ml"]     = round(volume_ml, 3)
        result["moles"]         = round(moles, 6)
        result["concentration"] = concentration
        result["confidence"]    = confidence

        print(f"[processor] pair {liquid}: before={vol_before:.3f}mL after={vol_after:.3f}mL "
              f"dispensed={volume_ml:.3f}mL conf={confidence}")

    except ValueError as e:
        print(f"[processor] Pair detection failed ({e})")
    except Exception as e:
        print(f"[processor] Unexpected error in pair: {e}")

    return result
