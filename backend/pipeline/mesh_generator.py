import numpy as np
import cv2
from PIL import Image
import os
import io

class MeshAndTextureGenerator:
    @staticmethod
    def generate_analytical_hillshade(
        dsm: np.ndarray,
        azimuth_deg: float = 315.0,
        altitude_deg: float = 45.0,
        cell_size_m: float = 10.0,
        z_factor: float = 1.0
    ) -> np.ndarray:
        azimuth_rad = np.radians(360.0 - azimuth_deg + 90.0)
        altitude_rad = np.radians(altitude_deg)

        kernel_x = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float32) / (8.0 * max(0.1, cell_size_m))
        kernel_y = np.array([[ 1,  2,  1], [ 0,  0,  0], [-1, -2, -1]], dtype=np.float32) / (8.0 * max(0.1, cell_size_m))

        dz_dx = cv2.filter2D(dsm * z_factor, -1, kernel_x)
        dz_dy = cv2.filter2D(dsm * z_factor, -1, kernel_y)

        slope_rad = np.arctan(np.sqrt(dz_dx**2 + dz_dy**2))
        aspect_rad = np.arctan2(dz_dy, -dz_dx)

        hillshade = (
            np.sin(altitude_rad) * np.cos(slope_rad) +
            np.cos(altitude_rad) * np.sin(slope_rad) * np.cos(azimuth_rad - aspect_rad)
        )
        hillshade = np.clip(hillshade, 0.0, 1.0)
        return (hillshade * 255.0).astype(np.uint8)

    @staticmethod
    def generate_hypsometric_dsm_texture(dsm: np.ndarray, contours: bool = True) -> np.ndarray:
        z_min, z_max = np.min(dsm), np.max(dsm)
        if z_max > z_min:
            norm = (dsm - z_min) / (z_max - z_min)
        else:
            norm = np.zeros_like(dsm)

        norm_uint8 = (norm * 255.0).astype(np.uint8)
        colored = cv2.applyColorMap(norm_uint8, cv2.COLORMAP_TURBO)
        colored_rgb = cv2.cvtColor(colored, cv2.COLOR_BGR2RGB)

        if contours:
            contour_interval = (z_max - z_min) / 10.0
            if contour_interval > 0.5:
                step = (dsm - z_min) / contour_interval
                frac = step - np.floor(step)
                contour_mask = (frac < 0.04) | (frac > 0.96)
                colored_rgb[contour_mask] = (colored_rgb[contour_mask] * 0.45).astype(np.uint8)

        return colored_rgb

    @staticmethod
    def generate_slope_texture(dsm: np.ndarray, cell_size_m: float = 10.0) -> np.ndarray:
        kernel_x = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float32) / (8.0 * max(0.1, cell_size_m))
        kernel_y = np.array([[ 1,  2,  1], [ 0,  0,  0], [-1, -2, -1]], dtype=np.float32) / (8.0 * max(0.1, cell_size_m))

        dz_dx = cv2.filter2D(dsm, -1, kernel_x)
        dz_dy = cv2.filter2D(dsm, -1, kernel_y)

        slope_deg = np.degrees(np.arctan(np.sqrt(dz_dx**2 + dz_dy**2)))
        slope_norm = np.clip(slope_deg / 50.0, 0.0, 1.0)
        slope_uint8 = (slope_norm * 255.0).astype(np.uint8)

        colored = cv2.applyColorMap(slope_uint8, cv2.COLORMAP_JET)
        return cv2.cvtColor(colored, cv2.COLOR_BGR2RGB)

    @staticmethod
    def generate_depth_texture(relative_depth: np.ndarray) -> np.ndarray:
        depth_norm = np.clip(relative_depth, 0.0, 1.0)
        depth_uint8 = (depth_norm * 255.0).astype(np.uint8)
        colored = cv2.applyColorMap(depth_uint8, cv2.COLORMAP_VIRIDIS)
        return cv2.cvtColor(colored, cv2.COLOR_BGR2RGB)

    @staticmethod
    def extract_heightfield_grid(dsm: np.ndarray, grid_size: int = 128) -> dict:
        dsm_resampled = cv2.resize(dsm, (grid_size, grid_size), interpolation=cv2.INTER_AREA)
        z_min = float(np.min(dsm_resampled))
        z_max = float(np.max(dsm_resampled))
        relief = max(0.1, z_max - z_min)

        normalized = (dsm_resampled - z_min) / relief

        return {
            "grid_size": grid_size,
            "min_elevation_m": round(z_min, 1),
            "max_elevation_m": round(z_max, 1),
            "relief_m": round(relief, 1),
            "elevations": dsm_resampled.tolist(),
            "normalized_heights": normalized.tolist()
        }

    @staticmethod
    def export_wavefront_obj(dsm: np.ndarray, output_path: str, grid_size: int = 128, vertical_scale: float = 0.05):
        resampled = cv2.resize(dsm, (grid_size, grid_size), interpolation=cv2.INTER_AREA)
        H, W = resampled.shape
        z_min = np.min(resampled)

        with open(output_path, "w") as f:
            for r in range(H):
                y = (r / (H - 1) - 0.5) * 100.0
                for c in range(W):
                    x = (c / (W - 1) - 0.5) * 100.0
                    z = (resampled[r, c] - z_min) * vertical_scale
                    f.write(f"v {x:.4f} {z:.4f} {y:.4f}\n")

            for r in range(H):
                v = 1.0 - (r / (H - 1))
                for c in range(W):
                    u = c / (W - 1)
                    f.write(f"vt {u:.4f} {v:.4f}\n")

            f.write("\ng terrain_mesh\ns 1\n")
            for r in range(H - 1):
                for c in range(W - 1):
                    v1 = r * W + c + 1
                    v2 = r * W + (c + 1) + 1
                    v3 = (r + 1) * W + (c + 1) + 1
                    v4 = (r + 1) * W + c + 1
                    f.write(f"f {v1}/{v1} {v2}/{v2} {v3}/{v3}\n")
                    f.write(f"f {v1}/{v1} {v3}/{v3} {v4}/{v4}\n")

    @staticmethod
    def export_esri_ascii_grid(dsm: np.ndarray, output_path: str, cell_size_m: float = 10.0, xll: float = 0.0, yll: float = 0.0):
        H, W = dsm.shape
        with open(output_path, "w") as f:
            f.write(f"NCOLS {W}\n")
            f.write(f"NROWS {H}\n")
            f.write(f"XLLCORNER {xll:.4f}\n")
            f.write(f"YLLCORNER {yll:.4f}\n")
            f.write(f"CELLSIZE {cell_size_m:.2f}\n")
            f.write("NODATA_VALUE -9999\n")
            for r in range(H):
                row_str = " ".join(f"{val:.2f}" for val in dsm[r, :])
                f.write(row_str + "\n")
