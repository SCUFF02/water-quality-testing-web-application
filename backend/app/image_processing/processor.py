"""
Dosing image processor.
Input:  path to a JPEG from ESP-CAM
Output: dict → volume_ml, moles, concentration

Pipeline:
1. Load image with OpenCV
2. Convert to HSV, isolate liquid color region
3. Find largest contour (liquid surface in container)
4. Estimate volume from pixel area × calibration constant
5. Calculate moles = concentration × volume_in_litres
"""
import cv2
import numpy as np
from typing import Dict, Optional

# Molar mass (g/mol) and typical working concentration (mol/L) per liquid
LIQUID_PROPERTIES = {
    "Chlorine":            {"molar_mass": 70.9,   "concentration": 0.05},
    "Alum":                {"molar_mass": 342.15,  "concentration": 0.10},
    "Lime":                {"molar_mass": 74.09,   "concentration": 0.05},
    "Ferric Sulfate":      {"molar_mass": 399.88,  "concentration": 0.08},
    "Sodium Hypochlorite": {"molar_mass": 74.44,   "concentration": 0.10},
    "Hydrogen Peroxide":   {"molar_mass": 34.01,   "concentration": 0.30},
    "Ozone":               {"molar_mass": 48.0,    "concentration": 0.02},
    "Fluoride":            {"molar_mass": 41.99,   "concentration": 0.10},
}

# Calibration constant: how many pixels² = 1 mL
# Calibrate this with a known-volume image from your actual setup
PIXELS_PER_ML = 500.0

def process_dosing_image(image_path: str, liquid: str) -> Dict[str, Optional[float]]:
    result: Dict[str, Optional[float]] = {
        "volume_ml":     None,
        "moles":         None,
        "concentration": None,
    }

    try:
        img = cv2.imread(image_path)
        if img is None:
            print(f"[processor] Could not read image: {image_path}")
            return result

        # Step 1 — blur to reduce noise
        blurred = cv2.GaussianBlur(img, (7, 7), 0)
        hsv     = cv2.cvtColor(blurred, cv2.COLOR_BGR2HSV)

        # Step 2 — isolate liquid (blue/cyan water-based solutions in white container)
        # Tune these HSV bounds for your actual liquid colour
        lower = np.array([85,  30,  50])
        upper = np.array([135, 255, 255])
        mask  = cv2.inRange(hsv, lower, upper)

        # Fallback: edge detection if colour mask is too small
        if cv2.countNonZero(mask) < 500:
            gray  = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            edges = cv2.Canny(gray, 50, 150)
            contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            mask = np.zeros(gray.shape, dtype=np.uint8)
            if contours:
                largest = max(contours, key=cv2.contourArea)
                cv2.drawContours(mask, [largest], -1, 255, -1)

        # Step 3 — find largest contour → liquid surface area
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return result

        largest = max(contours, key=cv2.contourArea)
        area_px = cv2.contourArea(largest)

        # Step 4 — pixel area → volume
        volume_ml = area_px / PIXELS_PER_ML

        # Step 5 — volume → moles
        props         = LIQUID_PROPERTIES.get(liquid, {"concentration": 0.1})
        concentration = props["concentration"]
        volume_l      = volume_ml / 1000.0
        moles         = concentration * volume_l

        result["volume_ml"]     = round(volume_ml, 3)
        result["moles"]         = round(moles, 6)
        result["concentration"] = concentration

    except Exception as e:
        print(f"[processor] Error: {e}")

    return result