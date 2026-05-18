"""
processor.py — Seringue 60 mL : détection du piston + interpolation
=====================================================================
Pipeline
--------
1. Localiser la seringue (colonne à variance maximale).
2. Trouver le piston = plus grand rectangle sombre horizontal.
3. Calculer pct_from_top = position Y du piston / hauteur valide.
4. Convertir en volume par interpolation linéaire sur la table de
   calibration construite depuis toutes les images du dossier dose/.
   (pas de régression = pas d'extrapolation erronée)

Propriétés des liquides
-----------------------
Chaque liquide possède une masse molaire et une concentration molaire.
Le volume dispensé (before − after) est converti en moles via :
    moles = concentration_mol_L × volume_L

Dossier de référence
--------------------
Le dossier dose/ doit contenir des images nommées d'après leur volume :
    0.png  1.png  … 60.png   (ou .jpg / .jpeg)
Les deux formats sont acceptés ; le nombre est extrait automatiquement.

Utilisation CLI
---------------
  # Vérifier la calibration
  python processor.py --verify [--dose <dossier>]

  # Lire une seule image
  python processor.py --image single.jpg --liquid Chlorine [--dose <dossier>]

  # Calculer le volume dispensé (avant/après)
  python processor.py --before before.jpg --after after.jpg --liquid Alum [--dose <dossier>]
"""
from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

# ── Constantes ────────────────────────────────────────────────────────────────

DOSE_DIR     = Path(__file__).parent / "dose"
TOTAL_VOLUME = 60.0          # mL — capacité totale de la seringue

# ── Propriétés des liquides ───────────────────────────────────────────────────

LIQUID_PROPERTIES: Dict[str, Dict[str, float]] = {
    "Chlorine":            {"molar_mass": 70.90,  "concentration": 0.05},
    "Alum":                {"molar_mass": 342.15, "concentration": 0.10},
    "Lime":                {"molar_mass": 74.09,  "concentration": 0.05},
    "Ferric Sulfate":      {"molar_mass": 399.88, "concentration": 0.08},
    "Sodium Hypochlorite": {"molar_mass": 74.44,  "concentration": 0.10},
    "Hydrogen Peroxide":   {"molar_mass": 34.01,  "concentration": 0.30},
    "Ozone":               {"molar_mass": 48.00,  "concentration": 0.02},
    "Fluoride":            {"molar_mass": 41.99,  "concentration": 0.10},
}

# ── Paramètres de détection ───────────────────────────────────────────────────

_THRESH_LEVELS   = [90, 100, 110, 120, 130]  # seuils successifs pour binarisation
_MORPH_KERNEL    = (2, 5)                    # fermeture morphologique (h, w)
_SYRINGE_HALF_W  = 70                        # demi-largeur (px) de la zone de recherche
_COL_SMOOTH_SIG  = 5.0                       # sigma du lissage gaussien des variances
_COL_SMOOTH_K    = 21                        # taille du noyau de lissage
_MARGIN_W_FRAC   = 0.05                      # marge latérale ignorée (fraction de largeur)
_MIN_ROW_MEAN    = 30                        # luminosité minimale d'une ligne valide

# ── Cache de la table de calibration ─────────────────────────────────────────

_calib_table: Optional[List[Tuple[float, float]]] = None  # (pct_from_top, volume_ml)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers bas niveau
# ─────────────────────────────────────────────────────────────────────────────

def _parse_volume_from_filename(name: str) -> Optional[float]:
    """
    Extrait le volume (mL) depuis un nom de fichier.
    Formats acceptés :
        10.png  10.jpg  10ml.jpg  10.5.png  10.5ml.png
    """
    stem = Path(name).stem.lower().replace("ml", "").strip()
    try:
        return float(stem)
    except ValueError:
        m = re.search(r"(\d+(?:\.\d+)?)", stem)
        return float(m.group(1)) if m else None


def _valid_region(gray: np.ndarray) -> Tuple[int, int]:
    """Retourne (y_start, y_end) en ignorant les bords noirs éventuels."""
    row_mean = gray.mean(axis=1)
    h = gray.shape[0]
    y_start, y_end = 0, h - 1
    for y in range(h):
        if row_mean[y] > _MIN_ROW_MEAN:
            y_start = y
            break
    for y in range(h - 1, -1, -1):
        if row_mean[y] > _MIN_ROW_MEAN:
            y_end = y
            break
    return y_start, y_end


# ─────────────────────────────────────────────────────────────────────────────
# Détection du piston
# ─────────────────────────────────────────────────────────────────────────────

def detect_piston_pct(image_path: str) -> Tuple[Optional[float], float]:
    """
    Détecte le piston noir dans l'image d'une seringue.

    Stratégie
    ---------
    • Localiser la colonne de la seringue par variance maximale.
    • Dans une bande de ±70 px autour de ce centre, chercher le plus
      grand rectangle sombre horizontal à plusieurs seuils successifs.
    • Retourner la position Y normalisée (pct_from_top) et une
      confiance proportionnelle à la surface du rectangle trouvé.

    Parameters
    ----------
    image_path : str
        Chemin vers l'image à analyser.

    Returns
    -------
    pct_from_top : float or None
        Position du piston en fraction [0, 1] depuis le haut de la zone
        valide. None si aucun piston n'a été détecté.
    confidence : float
        Score de confiance dans [0, 1].
    """
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Impossible de lire l'image : {image_path}")

    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    y_start, y_end = _valid_region(gray)
    valid_h = y_end - y_start
    if valid_h < 20:
        raise ValueError(f"Image invalide ou trop sombre : {image_path}")

    # Localiser la seringue par variance des colonnes
    margin_w = int(w * _MARGIN_W_FRAC)
    inner    = gray[y_start:y_end + 1, margin_w:w - margin_w]
    col_var  = inner.var(axis=0).astype(np.float32)
    col_sm   = cv2.GaussianBlur(
        col_var.reshape(1, -1), (_COL_SMOOTH_K, 1), _COL_SMOOTH_SIG
    ).reshape(-1)
    peak_col = int(np.argmax(col_sm)) + margin_w

    # Bande de recherche autour du centre de la seringue
    bx0    = max(0, peak_col - _SYRINGE_HALF_W)
    bx1    = min(w, peak_col + _SYRINGE_HALF_W)
    region = gray[y_start:y_end + 1, bx0:bx1]
    rh, rw = region.shape

    best_area = 0
    best_pct  = None
    best_conf = 0.0
    kernel    = np.ones(_MORPH_KERNEL, np.uint8)

    for thresh in _THRESH_LEVELS:
        _, dark = cv2.threshold(region, thresh, 255, cv2.THRESH_BINARY_INV)
        dark    = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, kernel)
        cnts, _ = cv2.findContours(dark, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for cnt in cnts:
            x, y, cw, ch = cv2.boundingRect(cnt)

            if cw < 15 or ch < 4 or ch > 55:  continue  # taille hors plage
            if cw > rw * 0.95:                 continue  # couvre toute la largeur
            if (cw / max(ch, 1)) < 1.0:        continue  # pas assez horizontal

            cy  = y + ch // 2
            pct = cy / rh
            if not (0.03 < pct < 0.97):        continue  # trop proche des bords

            area = cw * ch
            if area > best_area:
                best_area = area
                best_pct  = pct
                best_conf = float(np.clip(area / (rw * 30), 0.0, 1.0))

        if best_pct is not None:
            break  # seuil le plus bas suffisant → on s'arrête

    return best_pct, round(best_conf, 3)


# ─────────────────────────────────────────────────────────────────────────────
# Table de calibration
# ─────────────────────────────────────────────────────────────────────────────

def _build_calib_table(dose_dir: Path) -> List[Tuple[float, float]]:
    """
    Construit la table de calibration depuis les images du dossier dose/.

    Chaque image doit être nommée d'après son volume réel en mL
    (ex. ``0.png``, ``1.png`` … ``60.png``).  Les formats .jpg et .jpeg
    sont également acceptés.

    Returns
    -------
    list of (pct_from_top, volume_ml)
        Triée par pct décroissant (pct élevé ≡ piston en bas ≡ volume faible).
    """
    global _calib_table
    if _calib_table is not None:
        return _calib_table

    if not dose_dir.is_dir():
        raise FileNotFoundError(
            f"Dossier de référence introuvable : {dose_dir.resolve()}\n"
            "Créez un dossier dose/ à côté de processor.py et ajoutez-y\n"
            "des images nommées 0.png, 1.png, … 60.png."
        )

    pairs:  List[Tuple[float, float]] = []
    failed: List[str] = []

    print(f"[processor] Chargement de la table de calibration depuis : {dose_dir}")

    # Parcourir toutes les images du dossier (pas seulement 0..60)
    supported = {".png", ".jpg", ".jpeg"}
    for entry in sorted(dose_dir.iterdir()):
        if entry.suffix.lower() not in supported:
            continue
        vol = _parse_volume_from_filename(entry.name)
        if vol is None:
            print(f"[processor]   ignoré '{entry.name}' — volume non parsable")
            continue
        try:
            pct, _ = detect_piston_pct(str(entry))
            if pct is not None:
                pairs.append((pct, vol))
            else:
                failed.append(entry.name)
        except Exception as exc:
            print(f"[processor]   ignoré '{entry.name}' : {exc}")
            failed.append(entry.name)

    if len(pairs) < 3:
        raise RuntimeError(
            f"Pas assez de points de calibration ({len(pairs)} trouvés, 3 minimum).\n"
            f"Images sans piston détecté : {failed}"
        )

    # Tri par pct décroissant (volume croissant)
    pairs.sort(key=lambda x: x[0], reverse=True)

    mae = sum(abs(_interpolate(p, pairs) - v) for p, v in pairs) / len(pairs)
    print(
        f"[processor] Table : {len(pairs)} points  |  MAE={mae:.2f} mL  "
        f"|  Échecs={len(failed)}"
    )
    if failed:
        print(f"[processor]   Sans piston : {failed}")

    _calib_table = pairs
    return _calib_table


def _interpolate(pct: float, table: List[Tuple[float, float]]) -> float:
    """
    Convertit un pct_from_top en volume (mL) par interpolation linéaire.

    La table est triée par pct décroissant ; un pct élevé correspond à un
    piston bas et donc à un volume faible dans la seringue.
    """
    if not table:
        return 0.0
    if pct >= table[0][0]:
        return table[0][1]
    if pct <= table[-1][0]:
        return table[-1][1]

    for i in range(len(table) - 1):
        p1, v1 = table[i]
        p2, v2 = table[i + 1]
        if p2 <= pct <= p1:
            if p1 == p2:
                return v1
            t = (pct - p1) / (p2 - p1)
            return float(v1 + t * (v2 - v1))
    return table[-1][1]


# ─────────────────────────────────────────────────────────────────────────────
# API publique — lecture de volume
# ─────────────────────────────────────────────────────────────────────────────

def read_volume(image_path: str, dose_dir: Path = DOSE_DIR) -> Tuple[float, float]:
    """
    Lit le volume courant dans une image de seringue.

    Parameters
    ----------
    image_path : str
        Chemin vers l'image à analyser.
    dose_dir : Path, optional
        Dossier contenant les images de calibration (défaut : ``dose/``).

    Returns
    -------
    volume_ml : float
        Volume lu dans la seringue, en mL, clampé dans [0, TOTAL_VOLUME].
    confidence : float
        Score de confiance dans [0, 1].
    """
    table     = _build_calib_table(dose_dir)
    pct, conf = detect_piston_pct(image_path)

    if pct is None:
        raise ValueError(f"Piston non détecté dans : {image_path}")

    volume_ml = float(np.clip(_interpolate(pct, table), 0.0, TOTAL_VOLUME))
    return round(volume_ml, 1), conf


# ─────────────────────────────────────────────────────────────────────────────
# API publique — traitement d'une paire avant/après
# ─────────────────────────────────────────────────────────────────────────────

def process_dosing_pair(
    before_path: str,
    after_path:  str,
    liquid:      str,
    dose_dir:    Optional[str] = None,
) -> Dict[str, Optional[float]]:
    """
    Calcule le volume de liquide dispensé entre deux images (avant/après dosage).

    Parameters
    ----------
    before_path : str
        Image capturée AVANT le dosage.
    after_path : str
        Image capturée APRÈS le dosage.
    liquid : str
        Nom du liquide (clé dans LIQUID_PROPERTIES).
    dose_dir : str, optional
        Dossier de calibration (remplace la valeur par défaut).

    Returns
    -------
    dict avec les clés :
        volume_before_ml  – lecture avant dosage (mL)
        volume_after_ml   – lecture après dosage (mL)
        volume_ml         – volume dispensé = |avant − après| (mL)
        moles             – moles dispensées
        concentration     – concentration molaire utilisée (mol/L)
        confidence        – confiance moyenne des deux lectures [0..1]
    """
    result: Dict[str, Optional[float]] = {
        "volume_before_ml": None,
        "volume_after_ml":  None,
        "volume_ml":        None,
        "moles":            None,
        "concentration":    None,
        "confidence":       None,
    }
    ref_dir = Path(dose_dir) if dose_dir else DOSE_DIR

    try:
        print(f"[processor] BEFORE : {before_path}")
        vol_before, conf_before = read_volume(before_path, ref_dir)
        print(f"[processor]   → {vol_before} mL  (conf={conf_before:.3f})")

        print(f"[processor] AFTER  : {after_path}")
        vol_after, conf_after = read_volume(after_path, ref_dir)
        print(f"[processor]   → {vol_after} mL  (conf={conf_after:.3f})")

        dispensed     = abs(vol_before - vol_after)
        props         = LIQUID_PROPERTIES.get(liquid, {"concentration": 0.1})
        concentration = float(props["concentration"])
        moles         = concentration * (dispensed / 1000.0)   # volume en litres
        confidence    = round((conf_before + conf_after) / 2.0, 3)

        result.update({
            "volume_before_ml": vol_before,
            "volume_after_ml":  vol_after,
            "volume_ml":        round(dispensed, 1),
            "moles":            round(moles, 6),
            "concentration":    concentration,
            "confidence":       confidence,
        })

        print(
            f"[processor] {liquid} : avant={vol_before} mL  après={vol_after} mL  "
            f"dispensé={dispensed:.1f} mL  moles={moles:.6f}  conf={confidence}"
        )

    except FileNotFoundError as exc:
        print(f"[processor] Erreur dossier : {exc}")
    except ValueError as exc:
        print(f"[processor] Erreur image : {exc}")
    except Exception as exc:
        print(f"[processor] Erreur inattendue : {exc}")

    return result


# ─────────────────────────────────────────────────────────────────────────────
# API publique — traitement d'une image unique
# ─────────────────────────────────────────────────────────────────────────────

def process_dosing_image(
    image_path: str,
    liquid:     str,
    dose_dir:   Optional[str] = None,
) -> Dict[str, Optional[float]]:
    """
    Lit le volume d'une seule image de seringue.

    Parameters
    ----------
    image_path : str
        Chemin vers l'image à analyser.
    liquid : str
        Nom du liquide (clé dans LIQUID_PROPERTIES).
    dose_dir : str, optional
        Dossier de calibration (remplace la valeur par défaut).

    Returns
    -------
    dict avec les clés :
        volume_ml     – volume lu (mL)
        moles         – moles correspondantes
        concentration – concentration molaire (mol/L)
        confidence    – confiance de la lecture [0..1]
    """
    result: Dict[str, Optional[float]] = {
        "volume_ml":     None,
        "moles":         None,
        "concentration": None,
        "confidence":    None,
    }
    ref_dir = Path(dose_dir) if dose_dir else DOSE_DIR

    try:
        volume_ml, confidence = read_volume(image_path, ref_dir)
        props         = LIQUID_PROPERTIES.get(liquid, {"concentration": 0.1})
        concentration = float(props["concentration"])
        moles         = concentration * (volume_ml / 1000.0)

        result.update({
            "volume_ml":     volume_ml,
            "moles":         round(moles, 6),
            "concentration": concentration,
            "confidence":    confidence,
        })

        print(
            f"[processor] {liquid} : {volume_ml} mL  "
            f"moles={moles:.6f}  conf={confidence}"
        )

    except Exception as exc:
        print(f"[processor] Erreur : {exc}")

    return result


# ─────────────────────────────────────────────────────────────────────────────
# Utilitaires
# ─────────────────────────────────────────────────────────────────────────────

def reload_references() -> None:
    """Vide le cache de calibration (rechargement au prochain appel)."""
    global _calib_table
    _calib_table = None
    print("[processor] Cache de calibration vidé.")


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

def _verify(dose_path: Path) -> None:
    """Vérifie la précision de la calibration sur toutes les images dose/."""
    print(f"\n{'=' * 55}")
    print(f"  Vérification : {dose_path.resolve()}")
    print(f"{'=' * 55}\n")

    try:
        table = _build_calib_table(dose_path)
        print(f"  Table : {len(table)} points de calibration\n")
    except Exception as exc:
        print(f"Erreur : {exc}")
        raise SystemExit(1)

    errors = 0
    total  = 0
    supported = {".png", ".jpg", ".jpeg"}

    for entry in sorted(dose_path.iterdir()):
        if entry.suffix.lower() not in supported:
            continue
        vol = _parse_volume_from_filename(entry.name)
        if vol is None:
            continue
        total += 1
        try:
            read_vol, conf = read_volume(str(entry), dose_path)
            diff   = abs(read_vol - vol)
            status = "OK" if diff <= 2.0 else "!!"
            if diff > 2.0:
                errors += 1
            print(
                f"  [{status}] {entry.name:12s} → lu={read_vol:5.1f} mL  "
                f"erreur={diff:.1f} mL  conf={conf:.2f}"
            )
        except Exception as exc:
            print(f"  [!!] {entry.name:12s} → {exc}")
            errors += 1

    ok = total - errors
    print(
        f"\n  Total:{total}  OK:{ok}  Erreurs(>2 mL):{errors}  "
        f"Précision:{ok / max(total, 1) * 100:.0f}%\n"
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Lecteur seringue 60 mL — détection de piston + interpolation",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--dose",   default="dose",     help="Dossier de calibration")
    parser.add_argument("--liquid", default="Chlorine", help="Nom du liquide")
    parser.add_argument("--before", default=None,       help="Image avant dosage")
    parser.add_argument("--after",  default=None,       help="Image après dosage")
    parser.add_argument("--image",  default=None,       help="Image unique")
    parser.add_argument("--verify", action="store_true",
                        help="Vérifie la précision sur toutes les images dose/")
    args = parser.parse_args()

    dose_path = Path(args.dose)

    if args.verify:
        _verify(dose_path)

    elif args.before and args.after:
        res = process_dosing_pair(args.before, args.after, args.liquid, args.dose)
        print(f"\n{'=' * 45}")
        for k, v in res.items():
            print(f"  {k:20s} : {v}")
        print(f"{'=' * 45}\n")

    elif args.image:
        res = process_dosing_image(args.image, args.liquid, args.dose)
        print(f"\n{'=' * 45}")
        for k, v in res.items():
            print(f"  {k:20s} : {v}")
        print(f"{'=' * 45}\n")

    else:
        parser.print_help()


if __name__ == "__main__":
    main()