import numpy as np
import cv2
from PIL import Image
import os
import json

SAMPLES_METADATA = [
    {
        "id": "urban_metro",
        "title": "Urban Built Environment & Towers",
        "category": "urban",
        "region": "Metropolitan District Center",
        "coordinates": "35.6762° N, 139.6503° E",
        "srtm_min_m": 15.0,
        "srtm_max_m": 280.0,
        "cell_size_m": 2.5,
        "description": "Dense urban grid with high-rise structures, commercial complexes, and transit corridors.",
        "recommended_exaggeration": 1.2,
        "type": "urban"
    },
    {
        "id": "sparse_canyon",
        "title": "Sparse Arid Canyon & Escarpment",
        "category": "sparse",
        "region": "Gandikota Grand Canyon, AP",
        "coordinates": "14.8140° N, 78.2860° E",
        "srtm_min_m": 190.0,
        "srtm_max_m": 680.0,
        "cell_size_m": 10.0,
        "description": "Deeply incised river canyon cutting through arid quartzite plateau with vertical cliffs.",
        "recommended_exaggeration": 1.8,
        "type": "sparse"
    },
    {
        "id": "hilly_ridge",
        "title": "Hilly Rugged Mountain Ridge",
        "category": "hilly",
        "region": "Northern Uttarakhand, Himalayas",
        "coordinates": "30.7346° N, 79.0669° E",
        "srtm_min_m": 3100.0,
        "srtm_max_m": 5450.0,
        "cell_size_m": 12.5,
        "description": "High-altitude rugged metamorphic ridge with steep arêtes, talus slopes, and glacial valleys.",
        "recommended_exaggeration": 1.4,
        "type": "hilly"
    },
    {
        "id": "forested_valley",
        "title": "Forested Canopy & Highland Valley",
        "category": "forested",
        "region": "Western Ghats Rainforest Escarpment",
        "coordinates": "18.5204° N, 73.8567° E",
        "srtm_min_m": 450.0,
        "srtm_max_m": 1320.0,
        "cell_size_m": 10.0,
        "description": "Dense tropical wet evergreen canopy covering rolling basaltic ridges and dissected valleys.",
        "recommended_exaggeration": 1.5,
        "type": "forested"
    }
]

class SampleManager:
    def __init__(self, samples_dir: str):
        self.samples_dir = samples_dir
        os.makedirs(self.samples_dir, exist_ok=True)
        self._ensure_sample_files()

    def get_all_samples(self):
        return SAMPLES_METADATA

    def get_sample(self, sample_id: str):
        for s in SAMPLES_METADATA:
            if s["id"] == sample_id:
                img_path = os.path.join(self.samples_dir, f"{sample_id}.png")
                ref_path = os.path.join(self.samples_dir, f"{sample_id}_ref.npy")
                return {
                    **s,
                    "image_path": img_path,
                    "reference_path": ref_path if os.path.exists(ref_path) else None
                }
        return None

    def get_reference_dem(self, sample_id: str) -> np.ndarray:
        ref_path = os.path.join(self.samples_dir, f"{sample_id}_ref.npy")
        if os.path.exists(ref_path):
            return np.load(ref_path)
        return None

    def _ensure_sample_files(self):
        for s in SAMPLES_METADATA:
            img_path = os.path.join(self.samples_dir, f"{s['id']}.png")
            ref_path = os.path.join(self.samples_dir, f"{s['id']}_ref.npy")
            if not os.path.exists(img_path) or not os.path.exists(ref_path):
                self._generate_scenario(s, img_path, ref_path)

    def _generate_scenario(self, meta: dict, img_out: str, ref_out: str, size: int = 512):
        terrain_type = meta["type"]
        z_min = meta["srtm_min_m"]
        z_max = meta["srtm_max_m"]

        x = np.linspace(-3, 3, size)
        y = np.linspace(-3, 3, size)
        xx, yy = np.meshgrid(x, y)

        if terrain_type == "urban":
            base = 0.1 * np.sin(xx * 0.8) + 0.1 * np.cos(yy * 0.8)
            grid_x = np.sin(xx * 14.0)
            grid_y = np.sin(yy * 14.0)
            blocks = ((grid_x > 0.2) & (grid_y > 0.2)).astype(np.float32)

            np.random.seed(42)
            noise_grid = cv2.resize(np.random.rand(32, 32).astype(np.float32), (size, size), interpolation=cv2.INTER_NEAREST)
            structural_elevation = base + blocks * (0.3 + 0.6 * noise_grid)

            structural_elevation = cv2.medianBlur(structural_elevation.astype(np.float32), 3)
            elev_norm = np.clip(structural_elevation, 0.0, 1.0)
            ref_dsm = z_min + elev_norm * (z_max - z_min)

            img = np.zeros((size, size, 3), dtype=np.uint8)
            img[:, :, 0] = np.clip(70 + elev_norm * 140, 0, 255).astype(np.uint8)
            img[:, :, 1] = np.clip(75 + elev_norm * 140, 0, 255).astype(np.uint8)
            img[:, :, 2] = np.clip(80 + elev_norm * 145, 0, 255).astype(np.uint8)
            road_mask = (grid_x <= 0.2) | (grid_y <= 0.2)
            img[road_mask] = np.clip(img[road_mask] * 0.45 + 25, 0, 255).astype(np.uint8)

        elif terrain_type == "sparse":
            meander = 0.9 * np.sin(yy * 1.5) + 0.3 * np.cos(yy * 4.0)
            dist_to_river = np.abs(xx - meander)
            canyon_depth = np.clip(dist_to_river / 1.1, 0.0, 1.0)
            steps = np.floor(canyon_depth * 6.0) / 6.0 + 0.05 * np.sin(xx * 8.0)
            elev_norm = np.clip(steps, 0.0, 1.0)
            ref_dsm = z_min + elev_norm * (z_max - z_min)

            img = np.zeros((size, size, 3), dtype=np.uint8)
            img[:, :, 0] = np.clip(165 + steps * 50, 0, 255).astype(np.uint8)
            img[:, :, 1] = np.clip(120 + steps * 35, 0, 255).astype(np.uint8)
            img[:, :, 2] = np.clip(85 + steps * 20, 0, 255).astype(np.uint8)
            river_mask = dist_to_river < 0.16
            img[river_mask, 0] = 35
            img[river_mask, 1] = 90
            img[river_mask, 2] = 120

        elif terrain_type == "hilly":
            r1 = np.sin(xx * 2.2 + yy * 0.8) * np.cos(xx * 0.5 - yy * 2.0)
            r2 = 0.5 * np.sin(xx * 5.0 - yy * 4.0) * np.cos(xx * 3.5 + yy * 4.5)
            r3 = 0.25 * np.cos(xx * 10.0 + yy * 9.0)
            ridge = np.abs(r1 + r2 + r3)
            elev_norm = np.clip(ridge / 1.7, 0.0, 1.0)
            ref_dsm = z_min + elev_norm * (z_max - z_min)

            img = np.zeros((size, size, 3), dtype=np.uint8)
            img[:, :, 0] = np.clip(110 + ridge * 60, 0, 255).astype(np.uint8)
            img[:, :, 1] = np.clip(115 + ridge * 65, 0, 255).astype(np.uint8)
            img[:, :, 2] = np.clip(120 + ridge * 70, 0, 255).astype(np.uint8)
            snow_mask = ridge > 1.25
            img[snow_mask] = np.clip(img[snow_mask] * 1.5 + 85, 0, 255).astype(np.uint8)

        else:
            mesa_dist = np.maximum(np.abs(xx) - 0.7, 0) + np.maximum(np.abs(yy) - 0.8, 0)
            tableland = np.clip(1.8 - mesa_dist * 1.6, 0.0, 1.0)
            elev_norm = np.clip(tableland * 0.8 + 0.2 * np.cos(xx * 3.0) * np.sin(yy * 3.0), 0.0, 1.0)
            ref_dsm = z_min + elev_norm * (z_max - z_min)

            img = np.zeros((size, size, 3), dtype=np.uint8)
            img[:, :, 0] = np.clip(55 + elev_norm * 45, 0, 255).astype(np.uint8)
            img[:, :, 1] = np.clip(115 + elev_norm * 60, 0, 255).astype(np.uint8)
            img[:, :, 2] = np.clip(50 + elev_norm * 40, 0, 255).astype(np.uint8)

        Image.fromarray(img).save(img_out)
        np.save(ref_out, ref_dsm.astype(np.float32))
