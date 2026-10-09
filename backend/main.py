import os
import sys
import io
import uuid
import base64
import json
from typing import Optional, List
import numpy as np
import cv2
from PIL import Image
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from pipeline.depth_estimator import MonocularDepthEstimator
from pipeline.calibration import ScaleCalibrator
from pipeline.geospatial import GeospatialAnalyzer
from pipeline.mesh_generator import MeshAndTextureGenerator
from pipeline.validation import DSMValidator
from samples.sample_manager import SampleManager

app = FastAPI(
    title="DepthWizard Geospatial Topography Engine",
    description="Monocular Depth Estimation to Digital Surface Model (DSM) Pipeline & 3D Flythrough Platform",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTPUT_DIR = os.path.join(BASE_DIR, "output")
SAMPLES_DIR = os.path.join(BASE_DIR, "samples_data")
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(SAMPLES_DIR, exist_ok=True)

app.mount("/static-output", StaticFiles(directory=OUTPUT_DIR), name="static-output")

TASK_CACHE = {}

depth_estimator = MonocularDepthEstimator()
sample_manager = SampleManager(SAMPLES_DIR)

def np_to_base64_png(arr_rgb: np.ndarray) -> str:
    img = Image.fromarray(arr_rgb.astype(np.uint8))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64}"

def run_processing_pipeline(
    rgb_image: np.ndarray,
    geometadata: dict,
    calibration_mode: str,
    model_method: str = "ensemble",
    srtm_min_m: float = 200.0,
    srtm_max_m: float = 1800.0,
    cell_size_m: float = 10.0,
    relative_scale: float = 100.0,
    gcps: list = None,
    hypsometric_exp: float = 1.0,
    reference_dem: np.ndarray = None,
    metadata_source: str = "User Upload"
) -> dict:
    task_id = str(uuid.uuid4())[:8]
    task_folder = os.path.join(OUTPUT_DIR, task_id)
    os.makedirs(task_folder, exist_ok=True)

    relative_depth = depth_estimator.estimate_depth(
        rgb_image,
        target_resolution=(512, 512),
        method=model_method
    )

    if calibration_mode == "auto":
        if geometadata.get("is_georeferenced", False):
            calibration_mode = "srtm"
        else:
            calibration_mode = "rdsm"

    if calibration_mode == "rdsm":
        dsm, calib_meta = ScaleCalibrator.calibrate_rdsm(
            relative_depth,
            relative_scale_multiplier=relative_scale
        )
    elif calibration_mode == "gcp" and gcps:
        dsm, calib_meta = ScaleCalibrator.calibrate_gcp(
            relative_depth,
            gcps,
            fallback_min=srtm_min_m,
            fallback_max=srtm_max_m
        )
    else:
        dsm, calib_meta = ScaleCalibrator.calibrate_srtm(
            relative_depth,
            base_elevation_min=srtm_min_m,
            base_elevation_max=srtm_max_m,
            hypsometric_exponent=hypsometric_exp
        )

    effective_cell_size = geometadata.get("gsd_m", cell_size_m) if geometadata.get("is_georeferenced") else cell_size_m

    geomorphic_metrics = GeospatialAnalyzer.compute_terrain_metrics(dsm, cell_size_m=effective_cell_size)

    depth_texture = MeshAndTextureGenerator.generate_depth_texture(relative_depth)
    dsm_texture = MeshAndTextureGenerator.generate_hypsometric_dsm_texture(dsm, contours=True)
    slope_texture = MeshAndTextureGenerator.generate_slope_texture(dsm, cell_size_m=effective_cell_size)
    hillshade = MeshAndTextureGenerator.generate_analytical_hillshade(
        dsm, azimuth_deg=315.0, altitude_deg=45.0, cell_size_m=effective_cell_size
    )
    hillshade_rgb = np.stack([hillshade] * 3, axis=-1)

    heightfield_data = MeshAndTextureGenerator.extract_heightfield_grid(dsm, grid_size=128)

    geotiff_path = os.path.join(task_folder, "elevation_dsm.tif")
    obj_path = os.path.join(task_folder, "terrain_mesh.obj")
    asc_path = os.path.join(task_folder, "elevation_dsm.asc")

    GeospatialAnalyzer.export_geotiff(dsm, geotiff_path, cell_size_m=effective_cell_size)
    MeshAndTextureGenerator.export_wavefront_obj(dsm, obj_path, grid_size=128)
    MeshAndTextureGenerator.export_esri_ascii_grid(dsm, asc_path, cell_size_m=effective_cell_size)

    validation_data = None
    if reference_dem is not None:
        try:
            validation_data = DSMValidator.evaluate(dsm, reference_dem)
        except Exception as e:
            print(f"[Validation] Error evaluating reference DEM: {e}")

    orig_b64 = np_to_base64_png(rgb_image)
    depth_b64 = np_to_base64_png(depth_texture)
    dsm_b64 = np_to_base64_png(dsm_texture)
    slope_b64 = np_to_base64_png(slope_texture)
    hillshade_b64 = np_to_base64_png(hillshade_rgb)

    result = {
        "task_id": task_id,
        "metadata_source": metadata_source,
        "geometadata": geometadata,
        "calibration": calib_meta,
        "geospatial": geomorphic_metrics,
        "heightfield": heightfield_data,
        "validation": validation_data,
        "stability_benchmarks": DSMValidator.get_landscape_stability_matrix(),
        "textures": {
            "optical": orig_b64,
            "relative_depth": depth_b64,
            "elevation_dsm": dsm_b64,
            "slope": slope_b64,
            "hillshade": hillshade_b64
        },
        "exports": {
            "geotiff_url": f"/api/export/geotiff/{task_id}",
            "obj_url": f"/api/export/obj/{task_id}",
            "asc_url": f"/api/export/asc/{task_id}"
        }
    }

    TASK_CACHE[task_id] = {
        "dsm": dsm,
        "cell_size_m": effective_cell_size,
        "geometadata": geometadata,
        "reference_dem": reference_dem
    }

    return result

@app.get("/api/health")
def health():
    return {
        "status": "online",
        "service": "DepthWizard AI Geospatial Engine",
        "device": depth_estimator.device,
        "neural_backbone_loaded": depth_estimator.onnx_session is not None,
        "supported_models": ["neural (MiDaS v2.1 ONNX)", "photoclinometry", "ensemble"],
        "formats_supported": ["GeoTIFF", "TIFF", "PNG", "JPG", "WebP", "ESRI ASC", "Wavefront OBJ"]
    }

@app.get("/api/samples")
def list_samples():
    return sample_manager.get_all_samples()

@app.get("/api/benchmarks")
def get_benchmarks():
    return DSMValidator.get_landscape_stability_matrix()

@app.post("/api/process-sample/{sample_id}")
def process_sample(sample_id: str, model_method: str = "ensemble"):
    sample = sample_manager.get_sample(sample_id)
    if not sample:
        raise HTTPException(status_code=404, detail="Sample dataset not found")

    img = Image.open(sample["image_path"]).convert("RGB").resize((512, 512))
    rgb_arr = np.array(img)
    ref_dem = sample_manager.get_reference_dem(sample_id)

    geometadata = {
        "is_georeferenced": True,
        "format": "PNG (Benchmark Dataset)",
        "gsd_m": sample["cell_size_m"],
        "crs": f"UTM WGS 84 ({sample['coordinates']})",
        "dimensions": [512, 512]
    }

    return run_processing_pipeline(
        rgb_image=rgb_arr,
        geometadata=geometadata,
        calibration_mode="srtm",
        model_method=model_method,
        srtm_min_m=sample["srtm_min_m"],
        srtm_max_m=sample["srtm_max_m"],
        cell_size_m=sample["cell_size_m"],
        hypsometric_exp=1.0,
        reference_dem=ref_dem,
        metadata_source=f"Benchmark: {sample['title']} ({sample['category'].upper()})"
    )

@app.post("/api/process")
async def process_custom_image(
    file: UploadFile = File(...),
    calibration_mode: str = Form("auto"),
    model_method: str = Form("ensemble"),
    srtm_min_m: float = Form(200.0),
    srtm_max_m: float = Form(1800.0),
    cell_size_m: float = Form(10.0),
    relative_scale: float = Form(100.0),
    hypsometric_exp: float = Form(1.0),
    gcps_json: Optional[str] = Form(None)
):
    try:
        content = await file.read()
        rgb_arr, geometadata = GeospatialAnalyzer.parse_input_image_and_metadata(content, file.filename)
        pil_img = Image.fromarray(rgb_arr).resize((512, 512), Image.Resampling.LANCZOS)
        rgb_arr = np.array(pil_img)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to decode image: {str(e)}")

    gcps = []
    if gcps_json:
        try:
            gcps = json.loads(gcps_json)
        except Exception:
            gcps = []

    return run_processing_pipeline(
        rgb_image=rgb_arr,
        geometadata=geometadata,
        calibration_mode=calibration_mode,
        model_method=model_method,
        srtm_min_m=srtm_min_m,
        srtm_max_m=srtm_max_m,
        cell_size_m=cell_size_m,
        relative_scale=relative_scale,
        gcps=gcps,
        hypsometric_exp=hypsometric_exp,
        metadata_source=f"Upload: {file.filename}"
    )

@app.post("/api/validate")
async def validate_custom_reference(
    task_id: str = Form(...),
    reference_file: UploadFile = File(...)
):
    if task_id not in TASK_CACHE:
        raise HTTPException(status_code=404, detail="Task session expired or not found")

    cache = TASK_CACHE[task_id]
    dsm_pred = cache["dsm"]

    try:
        content = await reference_file.read()
        ref_arr, _ = GeospatialAnalyzer.parse_input_image_and_metadata(content, reference_file.filename)
        if ref_arr.ndim == 3:
            ref_dem = cv2.cvtColor(ref_arr, cv2.COLOR_RGB2GRAY).astype(np.float32)
        else:
            ref_dem = ref_arr.astype(np.float32)

        if ref_dem.max() <= 255.0 and np.max(dsm_pred) > 255.0:
            p_min, p_max = float(np.min(dsm_pred)), float(np.max(dsm_pred))
            ref_dem = p_min + (ref_dem / 255.0) * (p_max - p_min)

        val_result = DSMValidator.evaluate(dsm_pred, ref_dem)
        return val_result
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to validate reference file: {str(e)}")

@app.post("/api/profile-transect")
def sample_transect(
    task_id: str = Form(...),
    x1: float = Form(0.0),
    y1: float = Form(0.5),
    x2: float = Form(1.0),
    y2: float = Form(0.5),
    num_samples: int = Form(100)
):
    if task_id not in TASK_CACHE:
        raise HTTPException(status_code=404, detail="Task session expired or not found")

    cache = TASK_CACHE[task_id]
    profile = GeospatialAnalyzer.sample_elevation_profile(
        cache["dsm"],
        x1=x1, y1=y1, x2=x2, y2=y2,
        num_samples=num_samples,
        cell_size_m=cache["cell_size_m"]
    )
    return {"profile": profile}

@app.get("/api/export/geotiff/{task_id}")
def download_geotiff(task_id: str):
    tif_path = os.path.join(OUTPUT_DIR, task_id, "elevation_dsm.tif")
    if not os.path.exists(tif_path):
        raise HTTPException(status_code=404, detail="GeoTIFF export not found")
    return FileResponse(tif_path, media_type="image/tiff", filename=f"depthwizard_dsm_{task_id}.tif")

@app.get("/api/export/obj/{task_id}")
def download_obj(task_id: str):
    obj_path = os.path.join(OUTPUT_DIR, task_id, "terrain_mesh.obj")
    if not os.path.exists(obj_path):
        raise HTTPException(status_code=404, detail="OBJ export not found")
    return FileResponse(obj_path, media_type="text/plain", filename=f"depthwizard_mesh_{task_id}.obj")

@app.get("/api/export/asc/{task_id}")
def download_asc(task_id: str):
    asc_path = os.path.join(OUTPUT_DIR, task_id, "elevation_dsm.asc")
    if not os.path.exists(asc_path):
        raise HTTPException(status_code=404, detail="DSM ASC export not found")
    return FileResponse(asc_path, media_type="text/plain", filename=f"depthwizard_dsm_{task_id}.asc")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
