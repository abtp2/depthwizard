import numpy as np
import cv2
import io
import os
from PIL import Image
from typing import Dict, Any, List, Tuple
import tifffile

class GeospatialAnalyzer:
    @staticmethod
    def parse_input_image_and_metadata(file_bytes: bytes, filename: str) -> Tuple[np.ndarray, Dict[str, Any]]:
        is_tiff = filename.lower().endswith(('.tif', '.tiff'))
        geometadata = {
            "is_georeferenced": False,
            "format": filename.split('.')[-1].upper(),
            "gsd_m": 10.0,
            "crs": "Non-Georeferenced (Pixel Coordinates)",
            "bounds": None,
            "tiepoint": None,
            "dimensions": None
        }

        rgb_image = None

        if is_tiff:
            try:
                with tifffile.TiffFile(io.BytesIO(file_bytes)) as tif:
                    page = tif.pages[0]
                    geometadata["dimensions"] = [int(page.imagewidth), int(page.imagelength)]

                    pixel_scale = getattr(page, 'geotags', {}).get('ModelPixelScaleTag')
                    if pixel_scale is None and hasattr(page, 'tags'):
                        if 'ModelPixelScaleTag' in page.tags:
                            pixel_scale = page.tags['ModelPixelScaleTag'].value
                        elif 33550 in page.tags:
                            pixel_scale = page.tags[33550].value

                    tiepoint = getattr(page, 'geotags', {}).get('ModelTiepointTag')
                    if tiepoint is None and hasattr(page, 'tags'):
                        if 'ModelTiepointTag' in page.tags:
                            tiepoint = page.tags['ModelTiepointTag'].value
                        elif 33922 in page.tags:
                            tiepoint = page.tags[33922].value

                    if pixel_scale is not None:
                        geometadata["is_georeferenced"] = True
                        scale_x = float(pixel_scale[0])
                        geometadata["gsd_m"] = round(scale_x, 2)

                    if tiepoint is not None:
                        geometadata["is_georeferenced"] = True
                        geometadata["tiepoint"] = [float(v) for v in tiepoint[:6]]
                        if pixel_scale is not None:
                            origin_x = tiepoint[3]
                            origin_y = tiepoint[4]
                            w = page.imagewidth
                            h = page.imagelength
                            geometadata["bounds"] = {
                                "min_x": round(float(origin_x), 2),
                                "max_x": round(float(origin_x + w * pixel_scale[0]), 2),
                                "min_y": round(float(origin_y - h * pixel_scale[1]), 2),
                                "max_y": round(float(origin_y), 2)
                            }

                    if geometadata["is_georeferenced"]:
                        geometadata["crs"] = "WGS 84 / UTM Zone Projected (GeoTIFF Tags 33550/33922)"

                    arr = page.asarray()
                    if arr.ndim == 2:
                        rgb_image = np.stack([arr]*3, axis=-1)
                    elif arr.ndim == 3:
                        if arr.shape[0] in [1, 3, 4] and arr.shape[0] < arr.shape[1]:
                            arr = np.transpose(arr, (1, 2, 0))
                        rgb_image = arr[:, :, :3]

                    if rgb_image.dtype != np.uint8:
                        p_min, p_max = rgb_image.min(), rgb_image.max()
                        if p_max > p_min:
                            rgb_image = ((rgb_image - p_min) / (p_max - p_min) * 255.0).astype(np.uint8)
                        else:
                            rgb_image = np.zeros_like(rgb_image, dtype=np.uint8)

            except Exception as e:
                print(f"[GeospatialAnalyzer] Tiff parsing fallback: {e}")

        if rgb_image is None:
            pil_img = Image.open(io.BytesIO(file_bytes)).convert("RGB")
            rgb_image = np.array(pil_img)
            geometadata["dimensions"] = [int(rgb_image.shape[1]), int(rgb_image.shape[0])]

        return rgb_image, geometadata

    @staticmethod
    def export_geotiff(
        dsm: np.ndarray,
        output_path: str,
        cell_size_m: float = 10.0,
        origin_x: float = 500000.0,
        origin_y: float = 4000000.0,
        epsg_code: int = 32643
    ):
        dsm_f32 = dsm.astype(np.float32)

        geokeys = (
            1, 1, 0, 4,
            1024, 0, 1, 1,
            1025, 0, 1, 1,
            2048, 0, 1, 4326,
            3072, 0, 1, epsg_code
        )

        extratags = [
            (33550, 'd', 3, (float(cell_size_m), float(cell_size_m), 0.0), False),
            (33922, 'd', 6, (0.0, 0.0, 0.0, float(origin_x), float(origin_y), 0.0), False),
            (34735, 'H', len(geokeys), geokeys, False)
        ]

        tifffile.imwrite(
            output_path,
            dsm_f32,
            photometric='minisblack',
            extratags=extratags,
            metadata={'Description': 'DepthWizard Calibrated Digital Surface Model (DSM)'}
        )

    @staticmethod
    def compute_terrain_metrics(dsm: np.ndarray, cell_size_m: float = 10.0) -> Dict[str, Any]:
        H, W = dsm.shape

        z_min = float(np.min(dsm))
        z_max = float(np.max(dsm))
        z_mean = float(np.mean(dsm))
        z_median = float(np.median(dsm))
        z_std = float(np.std(dsm))
        relief = float(z_max - z_min)

        kernel_x = np.array([[-1, 0, 1],
                             [-2, 0, 2],
                             [-1, 0, 1]], dtype=np.float32) / (8.0 * max(0.1, cell_size_m))
        kernel_y = np.array([[ 1,  2,  1],
                             [ 0,  0,  0],
                             [-1, -2, -1]], dtype=np.float32) / (8.0 * max(0.1, cell_size_m))

        dz_dx = cv2.filter2D(dsm, -1, kernel_x)
        dz_dy = cv2.filter2D(dsm, -1, kernel_y)

        slope_rad = np.arctan(np.sqrt(dz_dx**2 + dz_dy**2))
        slope_deg = np.degrees(slope_rad)

        aspect_rad = np.arctan2(dz_dy, -dz_dx)
        aspect_deg = np.degrees(aspect_rad)
        aspect_deg = 90.0 - aspect_deg
        aspect_deg = np.where(aspect_deg < 0, aspect_deg + 360.0, aspect_deg)

        mean_slope = float(np.mean(slope_deg))
        max_slope = float(np.max(slope_deg))
        std_slope = float(np.std(slope_deg))

        flat_pct = float(np.mean(slope_deg < 5.0) * 100.0)
        gentle_pct = float(np.mean((slope_deg >= 5.0) & (slope_deg < 15.0)) * 100.0)
        moderate_pct = float(np.mean((slope_deg >= 15.0) & (slope_deg < 30.0)) * 100.0)
        steep_pct = float(np.mean((slope_deg >= 30.0) & (slope_deg < 45.0)) * 100.0)
        cliff_pct = float(np.mean(slope_deg >= 45.0) * 100.0)

        neighborhood_mean = cv2.blur(dsm, (7, 7))
        tpi = dsm - neighborhood_mean
        mean_tpi = float(np.mean(np.abs(tpi)))

        kernel_rough = np.ones((3, 3), dtype=np.float32) / 8.0
        kernel_rough[1, 1] = 0.0
        local_mean = cv2.filter2D(dsm, -1, kernel_rough)
        tri = np.sqrt(np.abs(dsm**2 - local_mean**2) + 1e-6)
        mean_tri = float(np.mean(tri))

        if mean_slope < 4.0 and relief < 80.0:
            classification = "Alluvial Plain / Flat Tableland"
        elif mean_slope < 10.0 and relief < 250.0:
            classification = "Undulating / Rolling Hills"
        elif mean_slope < 20.0 and relief < 600.0:
            classification = "Dissected Hilly Terrain"
        elif mean_slope < 32.0:
            classification = "Moderately Steep Mountainous"
        else:
            classification = "Rugged Alpine / Escarpment Complex"

        hist, bin_edges = np.histogram(dsm, bins=12)
        hypsometric_curve = [
            {
                "elevation_m": round(float((bin_edges[i] + bin_edges[i+1]) / 2.0), 1),
                "frequency_pct": round(float(hist[i] / dsm.size * 100.0), 2),
                "min_bound": round(float(bin_edges[i]), 1),
                "max_bound": round(float(bin_edges[i+1]), 1)
            }
            for i in range(len(hist))
        ]

        return {
            "elevation": {
                "min_m": round(z_min, 1),
                "max_m": round(z_max, 1),
                "mean_m": round(z_mean, 1),
                "median_m": round(z_median, 1),
                "relief_m": round(relief, 1),
                "std_dev_m": round(z_std, 1)
            },
            "slope": {
                "mean_deg": round(mean_slope, 1),
                "max_deg": round(max_slope, 1),
                "std_deg": round(std_slope, 1),
                "distribution": {
                    "flat_0_5_pct": round(flat_pct, 1),
                    "gentle_5_15_pct": round(gentle_pct, 1),
                    "moderate_15_30_pct": round(moderate_pct, 1),
                    "steep_30_45_pct": round(steep_pct, 1),
                    "cliff_over_45_pct": round(cliff_pct, 1)
                }
            },
            "geomorphology": {
                "classification": classification,
                "mean_tpi_m": round(mean_tpi, 2),
                "terrain_roughness_index_tri": round(mean_tri, 2),
                "cell_resolution_m": round(cell_size_m, 2)
            },
            "hypsometric_distribution": hypsometric_curve
        }

    @staticmethod
    def sample_elevation_profile(
        dsm: np.ndarray,
        x1: float, y1: float,
        x2: float, y2: float,
        num_samples: int = 100,
        cell_size_m: float = 10.0
    ) -> List[Dict[str, float]]:
        H, W = dsm.shape
        xs = np.linspace(x1 * (W - 1), x2 * (W - 1), num_samples)
        ys = np.linspace(y1 * (H - 1), y2 * (H - 1), num_samples)

        profile = []
        total_dist_m = 0.0

        for i in range(num_samples):
            px = int(np.clip(xs[i], 0, W - 1))
            py = int(np.clip(ys[i], 0, H - 1))
            elev = float(dsm[py, px])

            if i > 0:
                dx = (xs[i] - xs[i-1]) * cell_size_m
                dy = (ys[i] - ys[i-1]) * cell_size_m
                total_dist_m += float(np.sqrt(dx**2 + dy**2))

            profile.append({
                "distance_m": round(total_dist_m, 1),
                "elevation_m": round(elev, 1),
                "norm_x": round(float(xs[i] / W), 4),
                "norm_y": round(float(ys[i] / H), 4)
            })

        return profile
