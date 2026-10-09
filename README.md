# DepthWizard
### Geospatial Monocular Elevation & 3D Terrain Platform

**DepthWizard** is an end-to-end geospatial software pipeline that transforms single-view optical RGB remote-sensing satellite and aerial imagery into high-precision Digital Surface Models (DSM) and interactive 3D terrain meshes.

---

## 🚀 Key Capabilities

### 1. Non-Georeferenced & Georeferenced Support
- **Non-Georeferenced RGB Imagery (PNG, JPG, WebP)**: Produces a **Relative Digital Surface Model (rDSM)** for images without spatial metadata. Relative height values are preserved and used directly in real-time visualization and exports.
- **Georeferenced RGB Imagery (GeoTIFF / TIFF)**: Automatically parses geospatial coordinate tags (`ModelPixelScaleTag`, `ModelTiepointTag`, `GeoKeyDirectoryTag`, GSD, and CRS) to generate an **Absolute Digital Surface Model (DSM)** with metric height values (meters).

### 2. Multi-Backbone Depth Engine
- **Pretrained Neural Monocular Backbone**: MiDaS v2.1 ONNX with remote-sensing domain adaptation (nadir orthographic detrending to eliminate terrestrial perspective distortion).
- **Scientific Photoclinometry & Shape-from-Shading**: USGS-standard multi-scale photometric gradient inversion for remote sensing and planetary topography.
- **Synergistic Multi-Modal Ensemble**: Blends deep structural vision representations with high-frequency photoclinometric illumination details.

### 3. Metric Scale Calibration
- **SRTM / Regional DEM Reference**: Anchors relative disparity to regional topographic baselines ($Z_{min}$ to $Z_{max}$) with non-linear hypsographic power adjustment ($\gamma$).
- **Ground Control Points (GCPs)**: Ordinary Least Squares (OLS) regression $Z(x, y) = a \cdot D(x, y) + c_x x + c_y y + b$ using surveyed tie-points to calculate metric elevations and report RMSE fit scores.

### 4. Interactive 3D Terrain & Flythrough Engine (Three.js)
- **First-Person Flythrough Navigation**: Seamless WASD + Mouse look flight navigation allowing users to fly through valleys, around peaks, and analyze structural heights from arbitrary aerial perspectives.
- **Automated Cinematic Drone Tour**: One-click drone path sweeping across the terrain for hands-free 3D flythrough visualization.
- **Real-Time Point Inspector (Raycaster)**: Hover cursor over any terrain feature to inspect exact elevation ($Z$ in meters or rDSM), local slope (degrees), and spatial coordinates.
- **Multi-Texture Switching**: Instant switching between Optical RGB, Relative Depth (rDSM), Calibrated DSM, Horn's Slope heatmap, and Hillshade.
- **Dynamic Solar Illumination**: Interactive sun azimuth ($0^\circ-360^\circ$) and altitude ($15^\circ-80^\circ$) casting real-time shadows across ridges.
- **Vertical Relief Exaggeration**: Smooth slider ($0.4\times - 3.0\times$) with real-time normal recomputation.

### 5. DSM Estimation - Accuracy & Validation Module
- **Quantitative Metrics**: Evaluates **RMSE (m)**, **MAE (m)**, **Pearson Correlation ($r$)**, and **$R^2$ Determination** against LiDAR or reference DEM datasets.
- **Side-by-Side Visual Comparison**: Estimated DSM vs Ground Truth LiDAR DEM vs Spatial Residual Error Heatmap ($Z_{pred} - Z_{ref}$).
- **Landscape Stability Matrix**: Benchmarked performance across the 4 core remote-sensing archetypes:
  1. **Urban / Built Environment** (Tokyo / Metropolitan District)
  2. **Sparse / Arid Canyon** (Gandikota Grand Canyon)
  3. **Hilly / Rugged Alpine** (Himalayan Mountain Ridge)
  4. **Forested / Canopy Highlands** (Western Ghats Rainforest Escarpment)
- **Custom Reference Upload**: Users can drag & drop their own reference LiDAR/DEM file to validate custom scenes.

### 6. Standard Geospatial Format Exporters
- **GeoTIFF (`.tif`)**: High-precision 32-bit floating point DSM raster with embedded GeoTIFF tags (`ModelPixelScaleTag`, `ModelTiepointTag`, `GeoKeyDirectoryTag`).
- **ESRI ASCII Grid (`.asc`)**: Standard raster format compatible with QGIS and ArcGIS.
- **Wavefront 3D Mesh (`.obj`)**: 3D mesh with vertex coordinates and UV mapping.

---

## 🛠 Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, Vite, JavaScript, CSS3 Clean Light Tokens |
| **3D Engine** | Three.js, WebGL, OrbitControls, Custom Flythrough Controller |
| **Backend API** | Python, FastAPI, Uvicorn, Python-Multipart |
| **AI / Depth Backbone** | Pre-trained MiDaS v2.1 ONNX + Scientific Photoclinometry & Gradient Fallback |
| **Geospatial & Calib** | Tifffile GeoTIFF Engine, SRTM DEM Reference, Horn's 3×3 Slope, GCP Least-Squares |
| **Export Formats** | GeoTIFF (`.tif`), Wavefront 3D (`.obj`), ESRI ASCII Grid (`.asc`) |

---

## ⚡ Running Locally

### Backend (Runs directly from `backend` folder)
```bash
cd backend
pip install -r requirements.txt
python main.py
```
Or with uvicorn:
```bash
cd backend
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```
- API & Swagger Docs: `http://127.0.0.1:8000/docs`

### Frontend
```bash
cd frontend
npm install
npm run dev
```
- Web App: `http://localhost:5173`

---

## 🌐 Cloud Deployment

### 1. Backend on Render
1. Create a new **Web Service** on [Render](https://render.com).
2. Connect your Git repository.
3. Configure the service settings:
   - **Root Directory**: `backend`
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Deploy the service. Copy your public service URL (e.g. `https://your-service.onrender.com`).

### 2. Frontend on Vercel
1. Create a new project on [Vercel](https://vercel.com).
2. Connect your Git repository.
3. In Project Settings:
   - **Root Directory**: `frontend`
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Add the Environment Variable:
   - **Key**: `VITE_API_URL`
   - **Value**: `https://your-service.onrender.com` (your Render backend URL)
5. Deploy. Your application is live!

