import numpy as np
import cv2
from PIL import Image
import os
import io

class MonocularDepthEstimator:
    def __init__(self, model_path: str = None):
        if model_path is None:
            default_weights = os.path.join(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                "weights",
                "midas_small.onnx"
            )
            if os.path.exists(default_weights):
                model_path = default_weights

        self.model_path = model_path
        self.onnx_session = None
        self.input_name = None
        self.device = "CPU"
        self._initialize_onnx()

    def _initialize_onnx(self):
        if self.model_path and os.path.exists(self.model_path):
            try:
                import onnxruntime as ort
                providers = ['CPUExecutionProvider']
                if 'CUDAExecutionProvider' in ort.get_available_providers():
                    providers.insert(0, 'CUDAExecutionProvider')
                    self.device = "CUDA"

                self.onnx_session = ort.InferenceSession(self.model_path, providers=providers)
                self.input_name = self.onnx_session.get_inputs()[0].name
                print(f"[DepthEstimator] Loaded ONNX model on {self.device}: {self.model_path}")
            except Exception as e:
                print(f"[DepthEstimator] ONNX initialization skipped: {e}")
                self.onnx_session = None

    def estimate_depth(
        self,
        image_input,
        target_resolution: tuple = (512, 512),
        method: str = "ensemble"
    ) -> np.ndarray:
        rgb_img = self._prepare_image(image_input, target_resolution)

        if method == "photoclinometry":
            return self._scientific_photoclinometry_depth(rgb_img)

        elif method == "neural" and self.onnx_session is not None:
            try:
                raw_neural = self._infer_neural_onnx(rgb_img)
                H, W = raw_neural.shape
                y_ramp = np.linspace(0.0, 1.0, H)[:, None]
                detrended = raw_neural - 0.45 * y_ramp
                return self._normalize_01(detrended)
            except Exception as e:
                print(f"[DepthEstimator] Inference error: {e}")
                return self._scientific_photoclinometry_depth(rgb_img)

        elif method == "ensemble":
            photo_depth = self._scientific_photoclinometry_depth(rgb_img)
            if self.onnx_session is not None:
                try:
                    raw_neural = self._infer_neural_onnx(rgb_img)
                    H, W = raw_neural.shape
                    y_ramp = np.linspace(0.0, 1.0, H)[:, None]
                    detrended = self._normalize_01(raw_neural - 0.45 * y_ramp)
                    ensemble = 0.75 * photo_depth + 0.25 * detrended
                    return self._normalize_01(ensemble)
                except Exception as e:
                    print(f"[DepthEstimator] Ensemble fallback: {e}")
                    return photo_depth
            else:
                return photo_depth

        return self._scientific_photoclinometry_depth(rgb_img)

    def _prepare_image(self, image_input, target_resolution: tuple) -> np.ndarray:
        if isinstance(image_input, str):
            img = Image.open(image_input).convert("RGB")
        elif isinstance(image_input, bytes):
            img = Image.open(io.BytesIO(image_input)).convert("RGB")
        elif isinstance(image_input, Image.Image):
            img = image_input.convert("RGB")
        elif isinstance(image_input, np.ndarray):
            if len(image_input.shape) == 2:
                img = Image.fromarray(image_input).convert("RGB")
            else:
                img = Image.fromarray(image_input[:, :, :3].astype(np.uint8))
        else:
            raise ValueError("Unsupported image input format.")

        if target_resolution:
            img = img.resize(target_resolution, Image.Resampling.LANCZOS)
        return np.array(img)

    def _infer_neural_onnx(self, rgb_img: np.ndarray) -> np.ndarray:
        orig_h, orig_w, _ = rgb_img.shape
        model_input_size = 256

        resized = cv2.resize(rgb_img, (model_input_size, model_input_size), interpolation=cv2.INTER_CUBIC)
        norm_img = resized.astype(np.float32) / 255.0

        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        norm_img = (norm_img - mean) / std

        tensor_in = np.transpose(norm_img, (2, 0, 1))[np.newaxis, :, :, :]
        outputs = self.onnx_session.run(None, {self.input_name: tensor_in})
        disp = outputs[0].squeeze()

        disp_full = cv2.resize(disp, (orig_w, orig_h), interpolation=cv2.INTER_CUBIC)
        return self._normalize_01(disp_full)

    def _scientific_photoclinometry_depth(self, rgb_img: np.ndarray) -> np.ndarray:
        H, W, _ = rgb_img.shape
        gray = cv2.cvtColor(rgb_img, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0

        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray_uint8 = (gray * 255.0).astype(np.uint8)
        gray_clahe = clahe.apply(gray_uint8).astype(np.float32) / 255.0

        bilateral = cv2.bilateralFilter(gray_uint8, d=9, sigmaColor=75, sigmaSpace=75).astype(np.float32) / 255.0

        kernel_large = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25))
        top_hat = cv2.morphologyEx(gray_clahe, cv2.MORPH_TOPHAT, kernel_large)
        black_hat = cv2.morphologyEx(gray_clahe, cv2.MORPH_BLACKHAT, kernel_large)

        gx = cv2.Sobel(bilateral, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(bilateral, cv2.CV_32F, 0, 1, ksize=3)
        solar_azimuth = np.radians(315.0)
        sx = np.cos(solar_azimuth)
        sy = np.sin(solar_azimuth)
        shading_component = -(gx * sx + gy * sy)
        shading_component = cv2.GaussianBlur(shading_component, (15, 15), 0)

        blur_macro = cv2.GaussianBlur(gray_clahe, (31, 31), 0)
        blur_meso = cv2.GaussianBlur(gray_clahe, (15, 15), 0)
        macro_structure = blur_macro * 0.45 + blur_meso * 0.35

        composite = (
            macro_structure * 0.45 +
            bilateral * 0.25 +
            top_hat * 0.35 -
            black_hat * 0.30 +
            shading_component * 0.15
        )

        smooth_depth = cv2.GaussianBlur(composite, (5, 5), 0)
        return self._normalize_01(smooth_depth)

    @staticmethod
    def _normalize_01(arr: np.ndarray) -> np.ndarray:
        c_min = np.percentile(arr, 1)
        c_max = np.percentile(arr, 99)
        if c_max > c_min:
            depth_norm = np.clip((arr - c_min) / (c_max - c_min), 0.0, 1.0)
        else:
            depth_norm = np.zeros_like(arr)
        return depth_norm.astype(np.float32)
