"""
processor.py - Seringue 60mL : interpolation + NCC fallback
============================================================

Méthode principale (interpolation):
  1. Ignorer les bords noirs caméra
  2. Localiser la seringue (colonne avec max variance)
  3. Piston = plus grand rectangle sombre horizontal
  4. pct_from_top → volume par interpolation sur table dose/

Méthode fallback (NCC):
  Si le piston n'est pas détecté → comparer l'image entière
  contre toutes les références dose/ par NCC et prendre la meilleure.

La table d'interpolation ET le cache NCC sont construits une seule fois
au démarrage depuis les 61 images dose/0.png … dose/60.png.
"""
from __future__ import annotations
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import cv2
import numpy as np

DOSE_DIR     = Path(__file__).parent / "dose"
TOTAL_VOLUME = 60.0

LIQUID_PROPERTIES = {
    "Chlorine":            {"concentration": 0.05},
    "Alum":                {"concentration": 0.10},
    "Lime":                {"concentration": 0.05},
    "Ferric Sulfate":      {"concentration": 0.08},
    "Sodium Hypochlorite": {"concentration": 0.10},
    "Hydrogen Peroxide":   {"concentration": 0.30},
    "Ozone":               {"concentration": 0.02},
    "Fluoride":            {"concentration": 0.10},
}

# ── Caches ────────────────────────────────────────────────────────────────────
# Table interpolation : [(pct_from_top, volume_ml)] triée pct décroissant
_calib_table: Optional[List[Tuple[float, float]]] = None

# Cache NCC : [(volume_ml, image_preparee)]
_ncc_refs: Optional[List[Tuple[float, np.ndarray]]] = None


# ══════════════════════════════════════════════════════════════════════════════
# Utilitaires communs
# ══════════════════════════════════════════════════════════════════════════════

def _valid_region(gray: np.ndarray) -> Tuple[int, int]:
    """Retourne (y_start, y_end) en ignorant les bords noirs caméra (< 30)."""
    row_mean = gray.mean(axis=1)
    h = gray.shape[0]
    y_start, y_end = 0, h - 1
    for y in range(h):
        if row_mean[y] > 30:
            y_start = y
            break
    for y in range(h - 1, -1, -1):
        if row_mean[y] > 30:
            y_end = y
            break
    return y_start, y_end


# ══════════════════════════════════════════════════════════════════════════════
# Méthode 1 — Détection du piston + interpolation
# ══════════════════════════════════════════════════════════════════════════════

def _detect_piston_pct(image_path: str) -> Tuple[Optional[float], float]:
    """
    Détecte le piston (rectangle sombre horizontal) dans l'image.
    Retourne (pct_from_top, confidence) ou (None, 0) si non trouvé.
    """
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Impossible de lire : {image_path}")

    h, w   = img.shape[:2]
    gray   = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    y0, y1 = _valid_region(gray)
    valid_h = y1 - y0
    if valid_h < 20:
        return None, 0.0

    # Localiser la seringue par variance des colonnes
    mw    = int(w * 0.05)
    inner = gray[y0:y1 + 1, mw:w - mw]
    col_v = inner.var(axis=0).astype(np.float32)
    col_s = cv2.GaussianBlur(col_v.reshape(1, -1), (21, 1), 5.0).reshape(-1)
    cx    = int(np.argmax(col_s)) + mw

    # Zone de recherche autour du centre de la seringue
    bx0    = max(0,  cx - 70)
    bx1    = min(w,  cx + 70)
    region = gray[y0:y1 + 1, bx0:bx1]
    rh, rw = region.shape

    best_area = 0
    best_pct  = None
    best_conf = 0.0

    for thresh in [90, 100, 110, 120, 130]:
        _, dark = cv2.threshold(region, thresh, 255, cv2.THRESH_BINARY_INV)
        kernel  = np.ones((2, 5), np.uint8)
        dark    = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, kernel)
        cnts, _ = cv2.findContours(dark, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for cnt in cnts:
            x, y, cw, ch = cv2.boundingRect(cnt)
            if cw < 15 or ch < 4 or ch > 55:  continue
            if cw > rw * 0.95:                 continue
            if cw / max(ch, 1) < 1.0:          continue
            cy  = y + ch // 2
            pct = cy / rh
            if pct < 0.03 or pct > 0.97:       continue
            area = cw * ch
            if area > best_area:
                best_area = area
                best_pct  = pct
                best_conf = float(np.clip(area / (rw * 30), 0.0, 1.0))

        if best_pct is not None:
            break

    return best_pct, round(best_conf, 3)


def _interpolate(pct: float, table: List[Tuple[float, float]]) -> float:
    """Interpolation linéaire sur la table (triée pct décroissant)."""
    if pct >= table[0][0]:  return table[0][1]
    if pct <= table[-1][0]: return table[-1][1]
    for i in range(len(table) - 1):
        p1, v1 = table[i]
        p2, v2 = table[i + 1]
        if p2 <= pct <= p1:
            t = (pct - p1) / (p2 - p1) if p1 != p2 else 0
            return float(v1 + t * (v2 - v1))
    return table[-1][1]


def _build_calib_table(dose_dir: Path) -> List[Tuple[float, float]]:
    """Construit la table d'interpolation depuis dose/0.png … dose/60.png."""
    global _calib_table
    if _calib_table is not None:
        return _calib_table

    if not dose_dir.is_dir():
        raise FileNotFoundError(f"Dossier dose/ introuvable : {dose_dir.resolve()}")

    pairs: List[Tuple[float, float]] = []
    failed: List[int] = []
    print("[processor] Construction table interpolation ...")

    for ml in range(int(TOTAL_VOLUME) + 1):
        for ext in [".png", ".jpg", ".jpeg"]:
            p = dose_dir / f"{ml}{ext}"
            if not p.exists(): continue
            try:
                pct, _ = _detect_piston_pct(str(p))
                if pct is not None:
                    pairs.append((pct, float(ml)))
                else:
                    failed.append(ml)
            except Exception as e:
                print(f"[processor]   ignore {p.name}: {e}")
                failed.append(ml)
            break

    if len(pairs) < 3:
        raise RuntimeError(f"Pas assez de références ({len(pairs)})")

    pairs.sort(key=lambda x: x[0], reverse=True)
    mae = sum(abs(_interpolate(p, pairs) - v) for p, v in pairs) / len(pairs)
    print(f"[processor] Table interpolation: {len(pairs)} pts | MAE={mae:.2f}mL | Échecs={len(failed)}")
    _calib_table = pairs
    return _calib_table


# ══════════════════════════════════════════════════════════════════════════════
# Méthode 2 — NCC (fallback)
# ══════════════════════════════════════════════════════════════════════════════

def _prepare_ncc(image_path: str) -> np.ndarray:
    """Prétraitement pour NCC : gris + CLAHE + crop central + resize."""
    img  = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Impossible de lire : {image_path}")
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    enh  = clahe.apply(gray)
    h, w = enh.shape
    roi  = enh[int(h*0.05):int(h*0.95), int(w*0.20):int(w*0.80)]
    return cv2.resize(roi, (160, 320), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0


def _ncc_score(a: np.ndarray, b: np.ndarray) -> float:
    af = a.flatten().astype(np.float64);  af -= af.mean()
    bf = b.flatten().astype(np.float64);  bf -= bf.mean()
    d  = np.linalg.norm(af) * np.linalg.norm(bf)
    return float(np.dot(af, bf) / d) if d > 1e-9 else 0.0


def _build_ncc_refs(dose_dir: Path) -> List[Tuple[float, np.ndarray]]:
    """Charge et prépare les images de référence pour le NCC."""
    global _ncc_refs
    if _ncc_refs is not None:
        return _ncc_refs

    if not dose_dir.is_dir():
        raise FileNotFoundError(f"Dossier dose/ introuvable : {dose_dir.resolve()}")

    refs: List[Tuple[float, np.ndarray]] = []
    print("[processor] Chargement références NCC ...")

    for ml in range(int(TOTAL_VOLUME) + 1):
        for ext in [".png", ".jpg", ".jpeg"]:
            p = dose_dir / f"{ml}{ext}"
            if not p.exists(): continue
            try:
                refs.append((float(ml), _prepare_ncc(str(p))))
            except Exception as e:
                print(f"[processor]   NCC ignore {p.name}: {e}")
            break

    print(f"[processor] NCC: {len(refs)} références chargées")
    refs.sort(key=lambda x: x[0])
    _ncc_refs = refs
    return _ncc_refs


def _read_volume_ncc(image_path: str, dose_dir: Path) -> Tuple[float, float]:
    """Lit le volume par NCC (fallback)."""
    refs  = _build_ncc_refs(dose_dir)
    query = _prepare_ncc(image_path)
    scores = [(v, _ncc_score(query, ref)) for v, ref in refs]
    scores.sort(key=lambda x: x[1], reverse=True)
    # Moyenne pondérée des 3 meilleurs
    top3   = scores[:3]
    total  = sum(max(s, 0) for _, s in top3)
    if total < 1e-6:
        vol = scores[0][0]
    else:
        vol = sum(max(s, 0) * v for v, s in top3) / total
    conf = float(np.clip((scores[0][1] + 1.0) / 2.0, 0.0, 1.0))
    return round(float(np.clip(vol, 0, TOTAL_VOLUME)), 1), round(conf, 3)


# ══════════════════════════════════════════════════════════════════════════════
# Fonction principale de lecture
# ══════════════════════════════════════════════════════════════════════════════

def read_volume(image_path: str, dose_dir: Path = DOSE_DIR) -> Tuple[float, float]:
    """
    Lit le volume dans une image de seringue.

    Essaie d'abord la détection du piston + interpolation.
    Si le piston n'est pas détecté (conf < 0.1), utilise le NCC.

    Retourne (volume_ml, confidence).
    """
    # ── Méthode 1 : piston + interpolation ───────────────────────────────────
    try:
        table     = _build_calib_table(dose_dir)
        pct, conf = _detect_piston_pct(image_path)

        if pct is not None and conf >= 0.05:
            vol = float(np.clip(_interpolate(pct, table), 0.0, TOTAL_VOLUME))
            return round(vol, 1), conf
    except Exception as e:
        print(f"[processor]   Interpolation échouée: {e}")

    # ── Méthode 2 : NCC fallback ──────────────────────────────────────────────
    print(f"[processor]   → Fallback NCC pour {Path(image_path).name}")
    vol, conf = _read_volume_ncc(image_path, dose_dir)
    return vol, conf


# ══════════════════════════════════════════════════════════════════════════════
# API publique
# ══════════════════════════════════════════════════════════════════════════════

def process_dosing_pair(
    before_path: str,
    after_path:  str,
    liquid:      str,
    dose_dir:    Optional[str] = None,
) -> Dict[str, Optional[float]]:
    """Calcule le volume dispensé entre deux images avant/après dosage."""
    result: Dict[str, Optional[float]] = {
        "volume_before_ml": None, "volume_after_ml": None,
        "volume_ml": None, "moles": None,
        "concentration": None, "confidence": None,
    }
    ref_dir = Path(dose_dir) if dose_dir else DOSE_DIR
    try:
        print(f"[processor] BEFORE: {before_path}")
        vol_before, conf_before = read_volume(before_path, ref_dir)
        print(f"[processor]   -> {vol_before} mL (conf={conf_before})")

        print(f"[processor] AFTER:  {after_path}")
        vol_after, conf_after = read_volume(after_path, ref_dir)
        print(f"[processor]   -> {vol_after} mL (conf={conf_after})")

        dispensed     = abs(vol_before - vol_after)
        props         = LIQUID_PROPERTIES.get(liquid, {"concentration": 0.1})
        concentration = float(props["concentration"])
        moles         = concentration * (dispensed / 1000.0)
        confidence    = round((conf_before + conf_after) / 2.0, 3)

        result["volume_before_ml"] = vol_before
        result["volume_after_ml"]  = vol_after
        result["volume_ml"]        = round(dispensed, 1)
        result["moles"]            = round(moles, 6)
        result["concentration"]    = concentration
        result["confidence"]       = confidence

        print(f"[processor] {liquid}: avant={vol_before}mL apres={vol_after}mL "
              f"dispense={dispensed:.1f}mL moles={moles:.6f} conf={confidence}")
    except Exception as e:
        print(f"[processor] Erreur: {e}")
    return result


def process_dosing_image(
    image_path: str, liquid: str, dose_dir: Optional[str] = None,
) -> Dict[str, Optional[float]]:
    """Lit le volume d'une seule image."""
    result: Dict[str, Optional[float]] = {
        "volume_ml": None, "moles": None, "concentration": None, "confidence": None,
    }
    ref_dir = Path(dose_dir) if dose_dir else DOSE_DIR
    try:
        volume_ml, confidence = read_volume(image_path, ref_dir)
        props         = LIQUID_PROPERTIES.get(liquid, {"concentration": 0.1})
        concentration = float(props["concentration"])
        moles         = concentration * (volume_ml / 1000.0)
        result["volume_ml"]     = volume_ml
        result["moles"]         = round(moles, 6)
        result["concentration"] = concentration
        result["confidence"]    = confidence
        print(f"[processor] {liquid}: {volume_ml}mL moles={moles:.6f} conf={confidence}")
    except Exception as e:
        print(f"[processor] Erreur: {e}")
    return result


def reload_references() -> None:
    global _calib_table, _ncc_refs
    _calib_table = None
    _ncc_refs    = None
    print("[processor] Caches vidés.")


# ══════════════════════════════════════════════════════════════════════════════
# CLI
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Lecteur seringue 60mL")
    parser.add_argument("--dose",   default="dose")
    parser.add_argument("--before", default=None)
    parser.add_argument("--after",  default=None)
    parser.add_argument("--image",  default=None)
    parser.add_argument("--liquid", default="Chlorine")
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    dose_path = Path(args.dose)

    if args.verify:
        print(f"\n{'='*55}")
        print(f"  Verification : {dose_path.resolve()}")
        print(f"{'='*55}\n")
        try:
            _build_calib_table(dose_path)
            _build_ncc_refs(dose_path)
        except Exception as e:
            print(f"Erreur init: {e}"); exit(1)

        errors = 0; total = 0
        for ml in range(int(TOTAL_VOLUME) + 1):
            for ext in [".png", ".jpg"]:
                p = dose_path / f"{ml}{ext}"
                if not p.exists(): continue
                total += 1
                try:
                    vol, conf = read_volume(str(p), dose_path)
                    diff   = abs(vol - ml)
                    status = "OK" if diff <= 2.0 else "!!"
                    if diff > 2.0: errors += 1
                    method = "interp" if conf >= 0.05 else "NCC"
                    print(f"  [{status}] {ml:3d}.png -> lu={vol:5.1f}mL  "
                          f"erreur={diff:.1f}mL  conf={conf:.2f}")
                except Exception as e:
                    print(f"  [!!] {ml}.png -> {e}"); errors += 1
                break
        ok = total - errors
        print(f"\n  Total:{total}  OK:{ok}  Erreurs(>2mL):{errors}  "
              f"Precision:{ok/max(total,1)*100:.0f}%\n")

    elif args.before and args.after:
        res = process_dosing_pair(args.before, args.after, args.liquid, args.dose)
        print(f"\n{'='*45}")
        for k, v in res.items(): print(f"  {k:20s} : {v}")
        print(f"{'='*45}\n")

    elif args.image:
        res = process_dosing_image(args.image, args.liquid, args.dose)
        print(f"\n{'='*45}")
        for k, v in res.items(): print(f"  {k:20s} : {v}")
        print(f"{'='*45}\n")

    else:
        parser.print_help()


# ── Compatibilité : process_syringe_pair ─────────────────────────────────────
def process_syringe_pair(
    before_path: str,
    after_path:  str,
    liquid:      str,
    dose_dir:    Optional[str] = None,
) -> Dict[str, Optional[float]]:
    """
    Alias de process_dosing_pair pour compatibilité avec dosing.py.
    Calcule le volume dispensé entre deux images avant/après dosage.
    """
    return process_dosing_pair(before_path, after_path, liquid, dose_dir)