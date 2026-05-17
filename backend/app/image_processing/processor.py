
"""
processor.py — Lecture de volume de seringue avec base de donnees de reference
===============================================================================
Flux complet :
  1. La camera prend une photo (etat initial OU etat apres dosage)
  2. La photo est comparee aux images de reference (base de donnees)
     pour identifier visuellement l'etat le plus proche
  3. Le volume est calcule par detection du piston (methode directe)
     et valide par comparaison avec les references
  4. La difference de volume entre avant et apres dosage est retournee
 
Structure de la base de donnees :
  database/
      ref_001.png   <- images de reference avec metadonnees dans db_index.json
      ref_002.png
      ...
  db_index.json     <- {"ref_001.png": {"volume_ml": 10.0, ...}, ...}
 
Les 20 images originales (1.png-10.png et 51.png-60.png) peuvent etre
importees automatiquement via build_database_from_originals().
"""
from _future_ import annotations
 
import json
import os
import shutil
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple
 
import cv2
import numpy as np
 
# ── Proprietes des liquides ───────────────────────────────────────────────────
LIQUID_PROPERTIES: Dict[str, Dict[str, float]] = {
    "Chlorine":            {"molar_mass": 70.9,   "concentration": 0.05},
    "Alum":                {"molar_mass": 342.15, "concentration": 0.10},
    "Lime":                {"molar_mass": 74.09,  "concentration": 0.05},
    "Ferric Sulfate":      {"molar_mass": 399.88, "concentration": 0.08},
    "Sodium Hypochlorite": {"molar_mass": 74.44,  "concentration": 0.10},
    "Hydrogen Peroxide":   {"molar_mass": 34.01,  "concentration": 0.30},
    "Ozone":               {"molar_mass": 48.0,   "concentration": 0.02},
    "Fluoride":            {"molar_mass": 41.99,  "concentration": 0.10},
}
 
# ── Parametres seringue 60 ml (calibres sur 20 images reelles) ───────────────
SYRINGE_TOTAL_ML   = 60.0
SYRINGE_MIN_ML     = 0.0
SYRINGE_MAX_ML     = 60.0
Y_RATIO_AT_60ML    = 0.15   # piston en haut de l'image  -> 60 ml
Y_RATIO_AT_10ML    = 0.82   # piston en bas              -> 10 ml
 
# Detection du piston
STRIP_HALF_FRAC    = 0.12
DARK_THRESH        = 70
DARK_FRAC_MIN      = 0.15
MIN_PISTON_HEIGHT  = 12
SMOOTH_WIN         = 5
FALLBACK_THRESH    = 100
FALLBACK_FRAC      = 0.25
FALLBACK_HEIGHT    = 10
 
# Base de donnees
DB_DIR             = Path("database")
DB_INDEX_FILE      = DB_DIR / "db_index.json"
 
# Comparaison
TOP_K_MATCHES      = 3    # nombre de references les plus proches a moyenner
HIST_WEIGHT        = 0.45
STRUCT_WEIGHT      = 0.55
 
 
# ── Structures de donnees ─────────────────────────────────────────────────────
@dataclass
class PistonReading:
    volume_ml:    float
    piston_y_px:  int
    piston_ratio: float
    confidence:   float
    method:       str
 
 
@dataclass
class ReferenceEntry:
    filename:  str
    volume_ml: float
    features:  np.ndarray   # vecteur de features (hist + struct)
 
 
@dataclass
class MatchResult:
    volume_ml:       float   # volume estime apres comparaison DB
    direct_volume:   float   # volume estime par detection directe
    db_volume:       float   # volume estime par les references
    best_match_file: str     # image de reference la plus proche
    match_score:     float   # similarite cosinus 0-1
    confidence:      float
 
 
@dataclass
class DosageResult:
    volume_before_ml:  float
    volume_after_ml:   float
    dispensed_ml:      float
    moles:             float
    concentration:     float
    confidence_before: float
    confidence_after:  float
    liquid:            str
 
 
# ── Extraction de features visuelles ─────────────────────────────────────────
def extract_features(image: np.ndarray) -> np.ndarray:
    """
    Extrait un vecteur de features de l'image de seringue.
    Combine histogramme de luminosite + structure pixellique.
    """
    h, w = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
 
    # Bande centrale (zone de la seringue)
    cx   = w // 2
    half = max(10, int(w * 0.20))
    strip = gray[:, max(0, cx - half):min(w, cx + half)]
 
    # Histogramme normalise (64 bins)
    hist = cv2.calcHist([strip], [0], None, [64], [0, 256])
    hist = (hist.flatten() / (hist.sum() + 1e-8)).astype(np.float32)
 
    # Miniature structurelle (16x32 = 512 valeurs)
    thumb = cv2.resize(strip, (16, 32)).astype(np.float32) / 255.0
 
    return np.concatenate([hist * HIST_WEIGHT, thumb.flatten() * STRUCT_WEIGHT])
 
 
def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    n = min(len(a), len(b))
    a, b = a[:n].astype(np.float64), b[:n].astype(np.float64)
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na < 1e-10 or nb < 1e-10:
        return 0.0
    return float(np.dot(a, b) / (na * nb))
 
 
# ── Detection directe du piston ───────────────────────────────────────────────
def _dark_bands(
    strip: np.ndarray,
    thresh: int,
    frac_min: float,
    min_h: int,
) -> List[Tuple[int, int, float]]:
    per_row = (strip < thresh).mean(axis=1).astype(np.float32)
    smooth  = np.convolve(per_row, np.ones(SMOOTH_WIN) / SMOOTH_WIN, mode="same")
    bands: List[Tuple[int, int, float]] = []
    in_b = False
    y0   = 0
    h    = len(smooth)
    for y, v in enumerate(smooth):
        if v >= frac_min and not in_b:
            in_b = True; y0 = y
        elif v < frac_min and in_b:
            in_b = False
            if y - y0 >= min_h:
                bands.append((y0, y, float(smooth[y0:y].mean())))
    if in_b and h - y0 >= min_h:
        bands.append((y0, h, float(smooth[y0:h].mean())))
    return bands
 
 
def _select_piston_band(
    bands: List[Tuple[int, int, float]],
    img_height: int,
) -> Optional[Tuple[int, int, float]]:
    """
    Parmi toutes les bandes sombres, choisit celle qui correspond au piston.
    Regles:
      - Ignorer les bandes dans les 5% tout en bas (fond noir de la table)
      - Choisir la bande avec le meilleur score (taille x intensite)
        parmi celles dans les 92% superieurs de l'image
    """
    max_y = int(img_height * 0.92)
    valid = [b for b in bands if b[0] < max_y and (b[1] - b[0]) >= MIN_PISTON_HEIGHT]
    if not valid:
        return None
    return max(valid, key=lambda b: (b[1] - b[0]) * b[2])
 
 
def _ratio_to_volume(ratio: float) -> float:
    frac   = (ratio - Y_RATIO_AT_60ML) / max(Y_RATIO_AT_10ML - Y_RATIO_AT_60ML, 1e-8)
    volume = 60.0 - frac * 50.0
    return float(max(SYRINGE_MIN_ML, min(SYRINGE_MAX_ML, volume)))
 
 
def detect_piston(image: np.ndarray) -> Optional[PistonReading]:
    """
    Detecte le piston caoutchouc noir et retourne sa position + volume estime.
    """
    h, w = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
 
    cx    = w // 2
    half  = max(6, int(w * STRIP_HALF_FRAC))
    strip = gray[:, max(0, cx - half):min(w, cx + half)]
 
    # Tentative 1 : seuil strict
    bands  = _dark_bands(strip, DARK_THRESH,    DARK_FRAC_MIN, MIN_PISTON_HEIGHT)
    method = "primary"
 
    # Tentative 2 : seuil permissif
    if not bands:
        bands  = _dark_bands(strip, FALLBACK_THRESH, FALLBACK_FRAC, FALLBACK_HEIGHT)
        method = "fallback"
 
    best = _select_piston_band(bands, h)
    if best is None:
        return None
 
    piston_y  = best[0]
    ratio     = piston_y / max(h - 1, 1)
    volume_ml = _ratio_to_volume(ratio)
 
    # Confiance
    c_intensity = float(np.clip(best[2] / 0.40, 0.0, 1.0))
    c_size      = float(np.clip((best[1] - best[0]) / 25.0, 0.0, 1.0))
    c_range     = 1.0 if 0.0 <= volume_ml <= SYRINGE_TOTAL_ML else 0.5
    confidence  = float(np.clip(0.5 * c_intensity + 0.3 * c_size + 0.2 * c_range, 0.0, 1.0))
 
    return PistonReading(
        volume_ml    = volume_ml,
        piston_y_px  = piston_y,
        piston_ratio = ratio,
        confidence   = confidence,
        method       = method,
    )
 
 
# ── Base de donnees de references ─────────────────────────────────────────────
class ReferenceDatabase:
    """
    Gere la base de donnees d'images de reference.
 
    Chaque image de reference est associee a un volume connu.
    La base est stockee dans database/ avec un fichier d'index JSON.
    """
 
    def _init_(self, db_dir: Path = DB_DIR):
        self.db_dir  = Path(db_dir)
        self.index_file = self.db_dir / "db_index.json"
        self.entries: List[ReferenceEntry] = []
        self.db_dir.mkdir(parents=True, exist_ok=True)
 
    # ── Chargement ────────────────────────────────────────────────────────────
    def load(self) -> int:
        """
        Charge toutes les images de reference depuis le dossier database/.
        Retourne le nombre d'entrees chargees.
        """
        self.entries.clear()
 
        if not self.index_file.exists():
            print("[DB] Aucun index trouve. Utilisez add_image() ou build_database_from_originals().")
            return 0
 
        with open(self.index_file, encoding="utf-8") as f:
            index: Dict[str, dict] = json.load(f)
 
        loaded = 0
        for filename, meta in index.items():
            img_path = self.db_dir / filename
            if not img_path.exists():
                print(f"[DB] Image manquante : {img_path}")
                continue
            img = cv2.imread(str(img_path))
            if img is None:
                continue
            features = extract_features(img)
            self.entries.append(ReferenceEntry(
                filename  = filename,
                volume_ml = float(meta["volume_ml"]),
                features  = features,
            ))
            loaded += 1
 
        print(f"[DB] {loaded} references chargees depuis {self.db_dir}/")
        return loaded
 
    # ── Ajout d'une image ─────────────────────────────────────────────────────
    def add_image(self, image_path: str, volume_ml: float) -> bool:
        """
        Ajoute une image de reference a la base de donnees.
 
        Args:
            image_path: Chemin vers l'image source.
            volume_ml:  Volume reel associe a cette image.
 
        Returns:
            True si l'ajout a reussi.
        """
        src = Path(image_path)
        if not src.exists():
            print(f"[DB] Image introuvable : {src}")
            return False
 
        img = cv2.imread(str(src))
        if img is None:
            print(f"[DB] Impossible de lire : {src}")
            return False
 
        # Copier dans le dossier database/
        dest_name = src.name
        dest_path = self.db_dir / dest_name
        if dest_path.exists():
            # Eviter les doublons en ajoutant un suffixe
            stem = src.stem
            ext  = src.suffix
            i    = 1
            while (self.db_dir / f"{stem}_{i}{ext}").exists():
                i += 1
            dest_name = f"{stem}_{i}{ext}"
            dest_path = self.db_dir / dest_name
 
        shutil.copy2(str(src), str(dest_path))
 
        # Mettre a jour l'index
        index = self._load_index()
        index[dest_name] = {"volume_ml": volume_ml}
        self._save_index(index)
 
        # Ajouter en memoire
        features = extract_features(img)
        self.entries.append(ReferenceEntry(
            filename  = dest_name,
            volume_ml = volume_ml,
            features  = features,
        ))
        print(f"[DB] Ajout : {dest_name} -> {volume_ml} ml")
        return True
 
    # ── Import des 20 images originales ───────────────────────────────────────
    def build_from_originals(
        self,
        originals_dir: str,
        name_to_volume: Optional[Dict[str, float]] = None,
    ) -> int:
        """
        Importe les images de reference originales dans la base de donnees.
        Detecte automatiquement le volume de chaque image si name_to_volume
        n'est pas fourni.
 
        Args:
            originals_dir:   Dossier contenant les images originales.
            name_to_volume:  Dictionnaire optionnel {nom_fichier: volume_ml}.
                             Si absent, le volume est detecte automatiquement.
 
        Returns:
            Nombre d'images importees.
 
        Exemple:
            db.build_from_originals(
                "originals/",
                name_to_volume={
                    "1.png": 10.0, "2.png": 10.0, ..., "10.png": 10.0,
                    "51.png": 60.0, "52.png": 60.0, ..., "60.png": 60.0,
                }
            )
        """
        orig_dir = Path(originals_dir)
        if not orig_dir.exists():
            print(f"[DB] Dossier introuvable : {orig_dir}")
            return 0
 
        imported = 0
        for img_file in sorted(orig_dir.glob(".png")) + sorted(orig_dir.glob(".jpg")):
            img = cv2.imread(str(img_file))
            if img is None:
                continue
 
            # Volume : depuis le dictionnaire ou detection automatique
            if name_to_volume and img_file.name in name_to_volume:
                volume_ml = name_to_volume[img_file.name]
            else:
                reading = detect_piston(img)
                if reading is None:
                    print(f"[DB] Piston non detecte, image ignoree : {img_file.name}")
                    continue
                volume_ml = reading.volume_ml
 
            if self.add_image(str(img_file), volume_ml):
                imported += 1
 
        print(f"[DB] Import termine : {imported} images")
        return imported
 
    # ── Recherche du plus proche voisin ───────────────────────────────────────
    def find_closest(
        self,
        query_features: np.ndarray,
        top_k: int = TOP_K_MATCHES,
    ) -> List[Tuple[ReferenceEntry, float]]:
        """
        Trouve les top_k images de reference les plus similaires.
 
        Returns:
            Liste de (ReferenceEntry, score) triee par score decroissant.
        """
        if not self.entries:
            return []
 
        scored = [
            (entry, _cosine_similarity(query_features, entry.features))
            for entry in self.entries
        ]
        scored.sort(key=lambda x: -x[1])
        return scored[:top_k]
 
    # ── Helpers internes ──────────────────────────────────────────────────────
    def _load_index(self) -> dict:
        if self.index_file.exists():
            with open(self.index_file, encoding="utf-8") as f:
                return json.load(f)
        return {}
 
    def _save_index(self, index: dict) -> None:
        with open(self.index_file, "w", encoding="utf-8") as f:
            json.dump(index, f, indent=2, ensure_ascii=False)
 
    @property
    def size(self) -> int:
        return len(self.entries)
 
    def is_empty(self) -> bool:
        return len(self.entries) == 0
 
 
# ── Lecture de volume avec validation par la DB ───────────────────────────────
def read_volume(
    image: np.ndarray,
    db: ReferenceDatabase,
) -> MatchResult:
    """
    Lit le volume d'une image en combinant :
      - Detection directe du piston (methode principale)
      - Comparaison avec la base de donnees (validation)
 
    Le volume final est la moyenne ponderee des deux estimations.
 
    Args:
        image: Image BGR de la seringue.
        db:    Base de donnees de references chargee.
 
    Returns:
        MatchResult avec le volume final et les details de comparaison.
    """
    h, w = image.shape[:2]
 
    # 1. Detection directe
    piston = detect_piston(image)
    direct_vol  = piston.volume_ml if piston else 30.0  # valeur par defaut si echec
    direct_conf = piston.confidence if piston else 0.0
 
    # 2. Comparaison avec la DB
    features = extract_features(image)
    matches  = db.find_closest(features, top_k=TOP_K_MATCHES)
 
    if matches:
        # Volume DB = moyenne ponderee des top-K references par leur score
        total_score = sum(m[1] for m in matches)
        if total_score > 0:
            db_vol = sum(e.volume_ml * s for e, s in matches) / total_score
        else:
            db_vol = matches[0][0].volume_ml
 
        best_entry = matches[0][0]
        best_score = matches[0][1]
    else:
        # Pas de references : utiliser uniquement la detection directe
        db_vol     = direct_vol
        best_entry = None
        best_score = 0.0
 
    # 3. Volume final : fusion detection directe + DB
    if db.is_empty() or best_score < 0.50:
        # DB peu fiable ou vide : on fait confiance a la detection directe
        final_vol  = direct_vol
        confidence = direct_conf
    elif direct_conf < 0.40:
        # Detection directe peu fiable : on fait confiance a la DB
        final_vol  = db_vol
        confidence = float(np.clip(best_score, 0.0, 1.0))
    else:
        # Les deux sont fiables : moyenne ponderee
        w_direct = direct_conf
        w_db     = float(np.clip(best_score, 0.0, 1.0))
        total_w  = w_direct + w_db
        final_vol = (direct_vol * w_direct + db_vol * w_db) / max(total_w, 1e-8)
        confidence = float(np.clip((w_direct + w_db) / 2.0, 0.0, 1.0))
 
    final_vol = float(max(SYRINGE_MIN_ML, min(SYRINGE_MAX_ML, final_vol)))
 
    return MatchResult(
        volume_ml       = round(final_vol, 2),
        direct_volume   = round(direct_vol, 2),
        db_volume       = round(db_vol, 2),
        best_match_file = best_entry.filename if best_entry else "aucune",
        match_score     = round(best_score, 3),
        confidence      = round(confidence, 3),
    )
 
 
# ── Calcul chimique ───────────────────────────────────────────────────────────
def compute_moles(volume_ml: float, liquid: str) -> Tuple[float, float]:
    props         = LIQUID_PROPERTIES.get(liquid, {"concentration": 0.1})
    concentration = float(props["concentration"])
    moles         = concentration * (volume_ml / 1000.0)
    return round(moles, 6), concentration
 
 
# ══════════════════════════════════════════════════════════════════════════════
# POINTS D'ENTREE PRINCIPAUX
# ══════════════════════════════════════════════════════════════════════════════
 
def process_dosing_image(
    image_path: str,
    liquid: str,
    db: Optional[ReferenceDatabase] = None,
) -> Dict:
    """
    Analyse UNE image et retourne le volume courant de la seringue.
 
    Args:
        image_path: Chemin vers l'image ESP-CAM.
        liquid:     Liquide utilise (cle dans LIQUID_PROPERTIES).
        db:         Base de donnees de references (optionnel).
                    Si None, utilise uniquement la detection directe.
 
    Returns:
        {
          "volume_ml":     float,   volume de la seringue
          "moles":         float,
          "concentration": float,
          "confidence":    float,
          "direct_volume": float,   volume par detection directe
          "db_volume":     float,   volume par comparaison DB
          "best_match":    str,     image de reference la plus proche
          "match_score":   float,
        }
    """
    result = {
        "volume_ml":     None,
        "moles":         None,
        "concentration": None,
        "confidence":    None,
        "direct_volume": None,
        "db_volume":     None,
        "best_match":    None,
        "match_score":   None,
    }
 
    image = cv2.imread(image_path)
    if image is None:
        print(f"[processor] Impossible de lire : {image_path}")
        return result
 
    if db is not None and not db.is_empty():
        match = read_volume(image, db)
    else:
        piston = detect_piston(image)
        if piston is None:
            print(f"[processor] Piston non detecte : {image_path}")
            return result
        match = MatchResult(
            volume_ml       = piston.volume_ml,
            direct_volume   = piston.volume_ml,
            db_volume       = piston.volume_ml,
            best_match_file = "aucune",
            match_score     = 0.0,
            confidence      = piston.confidence,
        )
 
    moles, concentration = compute_moles(match.volume_ml, liquid)
 
    result.update({
        "volume_ml":     match.volume_ml,
        "moles":         moles,
        "concentration": concentration,
        "confidence":    match.confidence,
        "direct_volume": match.direct_volume,
        "db_volume":     match.db_volume,
        "best_match":    match.best_match_file,
        "match_score":   match.match_score,
    })
 
    print(
        f"[processor] {liquid}: {match.volume_ml:.2f} ml  "
        f"(direct={match.direct_volume:.2f}  db={match.db_volume:.2f})  "
        f"match={match.best_match_file} score={match.match_score:.2f}  "
        f"conf={match.confidence:.2f}"
    )
    return result
 
 
def process_dosing_pair(
    before_path: str,
    after_path: str,
    liquid: str,
    db: Optional[ReferenceDatabase] = None,
) -> Dict:
    """
    Calcule le volume distribue entre deux etats de la seringue.
 
    Compare les images avant et apres dosage (chacune avec la DB de references)
    et retourne la difference de volume = volume distribue.
 
    Args:
        before_path: Image de la seringue AVANT dosage.
        after_path:  Image de la seringue APRES dosage.
        liquid:      Liquide utilise.
        db:          Base de donnees de references (optionnel).
 
    Returns:
        {
          "volume_before_ml":  float,
          "volume_after_ml":   float,
          "dispensed_ml":      float,   <- difference = volume distribue
          "moles":             float,
          "concentration":     float,
          "confidence_before": float,
          "confidence_after":  float,
          "liquid":            str,
          "details_before":    dict,    lecture complete avant
          "details_after":     dict,    lecture complete apres
        }
    """
    null_result = {
        "volume_before_ml":  None,
        "volume_after_ml":   None,
        "dispensed_ml":      None,
        "moles":             None,
        "concentration":     None,
        "confidence_before": None,
        "confidence_after":  None,
        "liquid":            liquid,
        "details_before":    None,
        "details_after":     None,
    }
 
    print(f"[processor] Lecture AVANT  : {before_path}")
    r_before = process_dosing_image(before_path, liquid, db)
 
    print(f"[processor] Lecture APRES  : {after_path}")
    r_after  = process_dosing_image(after_path,  liquid, db)
 
    if r_before["volume_ml"] is None or r_after["volume_ml"] is None:
        print("[processor] Echec lecture avant/apres.")
        return null_result
 
    vol_before   = r_before["volume_ml"]
    vol_after    = r_after["volume_ml"]
    dispensed_ml = abs(vol_before - vol_after)
 
    moles, concentration = compute_moles(dispensed_ml, liquid)
 
    print(
        f"[processor] Avant={vol_before:.2f} ml  "
        f"Apres={vol_after:.2f} ml  "
        f"Distribue={dispensed_ml:.2f} ml  "
        f"Moles={moles:.6f}"
    )
 
    return {
        "volume_before_ml":  vol_before,
        "volume_after_ml":   vol_after,
        "dispensed_ml":      round(dispensed_ml, 2),
        "moles":             moles,
        "concentration":     concentration,
        "confidence_before": r_before["confidence"],
        "confidence_after":  r_after["confidence"],
        "liquid":            liquid,
        "details_before":    r_before,
        "details_after":     r_after,
    }
 
 
# ── Constructeur de base de donnees depuis les images originales ──────────────
def build_database_from_originals(
    originals_dir: str = ".",
    db_dir: str = "database",
) -> ReferenceDatabase:
    """
    Construit la base de donnees depuis les 20 images originales.
    Detecte automatiquement le volume de chaque image.
 
    Mapping connu pour les images originales :
      1.png  - 10.png  -> piston en bas  (~5-17 ml selon position exacte)
      51.png - 60.png  -> piston en haut (~53-60 ml)
 
    Si tu preferes specifier les volumes manuellement, utilise :
        db.add_image("1.png", 10.0)
        db.add_image("51.png", 60.0)
        ...
 
    Returns:
        ReferenceDatabase chargee et prete a l'emploi.
    """
    db = ReferenceDatabase(Path(db_dir))
 
    # Volumes detectes automatiquement sur les images reelles
    # (issus de la calibration initiale, tu peux les corriger)
    known_volumes = {
        "1.png":  10.0,  "2.png":  10.0,  "3.png":  10.0,
        "4.png":  10.0,  "5.png":  13.0,  "6.png":  15.0,
        "7.png":  17.0,  "8.png":  13.0,  "9.png":  15.0,
        "10.png": 17.0,
        "51.png": 59.0,  "52.png": 60.0,  "53.png": 60.0,
        "54.png": 53.0,  "55.png": 60.0,  "56.png": 60.0,
        "57.png": 58.0,  "58.png": 58.0,  "59.png": 55.0,
        "60.png": 60.0,
    }
 
    db.build_from_originals(originals_dir, name_to_volume=known_volumes)
    return db
 
 
# ── Ligne de commande ─────────────────────────────────────────────────────────
if _name_ == "_main_":
    import argparse
 
    parser = argparse.ArgumentParser(description="Lecture de volume de seringue")
    parser.add_argument("images", nargs="+",
                        help="1 image (lecture) ou 2 images (avant apres)")
    parser.add_argument("--liquid",  default="Chlorine",
                        help="Liquide (default: Chlorine)")
    parser.add_argument("--db",      default="database",
                        help="Dossier de la base de donnees (default: database)")
    parser.add_argument("--build-db", metavar="ORIG_DIR",
                        help="Construire la DB depuis un dossier d images originales")
    args = parser.parse_args()
 
    # Charger ou construire la base de donnees
    db = ReferenceDatabase(Path(args.db))
 
    if args.build_db:
        db = build_database_from_originals(args.build_db, args.db)
    else:
        n = db.load()
        if n == 0:
            print("[INFO] Base de donnees vide : detection directe uniquement.")
            db = None
 
    # Traitement
    if len(args.images) == 1:
        result = process_dosing_image(args.images[0], args.liquid, db)
    else:
        result = process_dosing_pair(args.images[0], args.images[1], args.liquid, db)
 
    print("\n" + "=" * 50)
    print(json.dumps(result, indent=2, ensure_ascii=False))