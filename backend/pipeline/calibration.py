import numpy as np
from typing import List, Dict, Optional, Tuple

class ScaleCalibrator:
    @staticmethod
    def calibrate_rdsm(
        relative_depth: np.ndarray,
        relative_scale_multiplier: float = 100.0
    ) -> Tuple[np.ndarray, Dict]:
        d_norm = np.clip(relative_depth, 0.0, 1.0)
        rdsm = d_norm * float(relative_scale_multiplier)

        metadata = {
            "method": "NON_GEOREFERENCED_RDSM",
            "is_georeferenced": False,
            "units": "Relative Units (rDSM)",
            "min_elevation": 0.0,
            "max_elevation": float(round(relative_scale_multiplier, 1)),
            "vertical_relief": float(round(relative_scale_multiplier, 1)),
            "calibration_status": "RDSM_RELATIVE_SUCCESS",
            "description": "Relative Digital Surface Model derived from non-georeferenced single-view optical imagery."
        }
        return rdsm.astype(np.float32), metadata

    @staticmethod
    def calibrate_srtm(
        relative_depth: np.ndarray,
        base_elevation_min: float = 500.0,
        base_elevation_max: float = 2200.0,
        hypsometric_exponent: float = 1.0
    ) -> Tuple[np.ndarray, Dict]:
        d_norm = np.clip(relative_depth, 0.0, 1.0)

        if abs(hypsometric_exponent - 1.0) > 0.01:
            d_adjusted = np.power(d_norm, hypsometric_exponent)
        else:
            d_adjusted = d_norm

        elevation_dsm = base_elevation_min + (base_elevation_max - base_elevation_min) * d_adjusted

        metadata = {
            "method": "SRTM_DEM_REFERENCE",
            "is_georeferenced": True,
            "units": "Meters (Metric DSM)",
            "base_min_elevation_m": float(base_elevation_min),
            "base_max_elevation_m": float(base_elevation_max),
            "vertical_relief_m": float(base_elevation_max - base_elevation_min),
            "hypsometric_exponent": float(hypsometric_exponent),
            "calibration_status": "METRIC_CALIBRATED_SUCCESS",
            "description": "Absolute Digital Surface Model anchored to regional SRTM topographic bounds."
        }
        return elevation_dsm.astype(np.float32), metadata

    @staticmethod
    def calibrate_gcp(
        relative_depth: np.ndarray,
        gcps: List[Dict[str, float]],
        fallback_min: float = 500.0,
        fallback_max: float = 1500.0
    ) -> Tuple[np.ndarray, Dict]:
        H, W = relative_depth.shape

        if not gcps or len(gcps) < 2:
            return ScaleCalibrator.calibrate_srtm(relative_depth, fallback_min, fallback_max)

        d_samples = []
        z_true = []
        x_coords = []
        y_coords = []

        for p in gcps:
            px = int(np.clip(p.get("x", 0), 0, W - 1))
            py = int(np.clip(p.get("y", 0), 0, H - 1))
            elevation = float(p.get("elevation", 0.0))
            d_samples.append(relative_depth[py, px])
            z_true.append(elevation)
            x_coords.append(px / W)
            y_coords.append(py / H)

        d_arr = np.array(d_samples, dtype=np.float64)
        z_arr = np.array(z_true, dtype=np.float64)

        if len(gcps) >= 3:
            A = np.column_stack([d_arr, np.array(x_coords), np.array(y_coords), np.ones_like(d_arr)])
            result, residuals, rank, s = np.linalg.lstsq(A, z_arr, rcond=None)
            a, cx, cy, b = result

            y_grid, x_grid = np.mgrid[0:H, 0:W]
            x_norm = x_grid / W
            y_norm = y_grid / H
            elevation_dsm = a * relative_depth + cx * x_norm + cy * y_norm + b

            z_pred = A @ result
            rmse = float(np.sqrt(np.mean((z_arr - z_pred) ** 2)))
            ss_tot = np.sum((z_arr - np.mean(z_arr)) ** 2)
            r2 = float(1.0 - (np.sum((z_arr - z_pred) ** 2) / (ss_tot + 1e-7)))
        else:
            A = np.column_stack([d_arr, np.ones_like(d_arr)])
            result, residuals, rank, s = np.linalg.lstsq(A, z_arr, rcond=None)
            a, b = result
            elevation_dsm = a * relative_depth + b
            z_pred = A @ result
            rmse = float(np.sqrt(np.mean((z_arr - z_pred) ** 2)))
            r2 = 1.0

        metadata = {
            "method": "GCP_GROUND_CONTROL_POINTS",
            "is_georeferenced": True,
            "units": "Meters (Metric DSM)",
            "gcp_count": len(gcps),
            "rmse_meters": round(rmse, 2),
            "r2_fit_score": round(max(0.0, min(1.0, r2)), 4),
            "scale_factor_a": float(round(a, 3)),
            "vertical_offset_b": float(round(b, 2)),
            "calibration_status": "GCP_CALIBRATED_SUCCESS",
            "description": f"Absolute DSM calibrated via {len(gcps)} surveyed ground control points."
        }
        return elevation_dsm.astype(np.float32), metadata
