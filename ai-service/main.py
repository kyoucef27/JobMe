import logging
import subprocess
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from enum import Enum

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from insightface.app import FaceAnalysis

# ─────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("face_verification")

# ─────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────
class Config:
    THRESHOLD: float = 0.50
    MAX_FILE_SIZE_MB: int = 10
    ALLOWED_CONTENT_TYPES: set = {"image/jpeg", "image/png", "image/webp"}
    MIN_FACE_CONFIDENCE: float = 0.6


class MatchConfidence(str, Enum):
    HIGH   = "high"    # > 0.70
    MEDIUM = "medium"  # 0.50–0.70
    LOW    = "low"     # < 0.50


# ─────────────────────────────────────────────
# Lifespan
# ─────────────────────────────────────────────
@dataclass
class AppState:
    face_analyzer: FaceAnalysis
    device: str


app_state: AppState | None = None


def get_gpu_name() -> str:
    try:
        name = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
            text=True
        ).strip()
        return name  # e.g. "NVIDIA GeForce RTX 3060"
    except Exception:
        return "Unknown NVIDIA GPU"


@asynccontextmanager
async def lifespan(app: FastAPI):
    global app_state
    logger.info("Loading FaceAnalysis model...")
    analyzer = FaceAnalysis(providers=["CUDAExecutionProvider", "CPUExecutionProvider"])
    try:
        analyzer.prepare(ctx_id=0, det_size=(640, 640))
        gpu_name = get_gpu_name()
        device = f"GPU ({gpu_name})"
    except Exception:
        analyzer.prepare(ctx_id=-1, det_size=(640, 640))
        device = "CPU"
    app_state = AppState(face_analyzer=analyzer, device=device)
    logger.info("Model ready on %s", device)
    yield
    logger.info("Shutting down.")


# ─────────────────────────────────────────────
# App
# ─────────────────────────────────────────────
app = FastAPI(
    title="Face Verification Service",
    version="2.0.0",
    description="Compare a selfie against an ID photo using InsightFace embeddings.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────
# Exception handler
# ─────────────────────────────────────────────
@app.exception_handler(HTTPException)
async def http_exception_handler(_, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail, "status_code": exc.status_code},
    )


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────
async def validate_and_read(file: UploadFile, label: str) -> bytes:
    if file.content_type not in Config.ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"{label}: unsupported type '{file.content_type}'. "
                   f"Allowed: {Config.ALLOWED_CONTENT_TYPES}",
        )
    data = await file.read()
    size_mb = len(data) / (1024 * 1024)
    if size_mb > Config.MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=413,
            detail=f"{label} exceeds {Config.MAX_FILE_SIZE_MB} MB limit ({size_mb:.1f} MB)",
        )
    return data


def decode_image(file_bytes: bytes, label: str) -> np.ndarray:
    arr = np.frombuffer(file_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail=f"{label}: could not decode image")
    return img


def extract_best_face(image: np.ndarray, label: str) -> tuple[np.ndarray, float]:
    """Return embedding + det_score for the highest-confidence face."""
    faces = app_state.face_analyzer.get(image)
    if not faces:
        raise HTTPException(status_code=400, detail=f"{label}: no face detected")

    best = max(faces, key=lambda f: f.det_score)

    if best.det_score < Config.MIN_FACE_CONFIDENCE:
        raise HTTPException(
            status_code=400,
            detail=f"{label}: face confidence too low ({best.det_score:.2f}). "
                   "Please use a clearer image.",
        )
    if len(faces) > 1:
        logger.warning("%s: %d faces detected — using highest-confidence one.", label, len(faces))

    return best.embedding, float(best.det_score)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0.0 or nb == 0.0:
        raise HTTPException(status_code=400, detail="Invalid embedding (zero-norm vector)")
    return float(np.dot(a, b) / (na * nb))


def score_to_confidence(similarity: float) -> MatchConfidence:
    if similarity >= 0.70:
        return MatchConfidence.HIGH
    if similarity >= Config.THRESHOLD:
        return MatchConfidence.MEDIUM
    return MatchConfidence.LOW


# ─────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "ok",
        "device": app_state.device if app_state else "not loaded",
        "threshold": Config.THRESHOLD,
    }


@app.post("/compare")
async def compare(
    id_image: UploadFile = File(..., description="Photo ID image"),
    selfie:   UploadFile = File(..., description="Live selfie image"),
):
    t0 = time.perf_counter()

    id_bytes     = await validate_and_read(id_image, "id_image")
    selfie_bytes = await validate_and_read(selfie,   "selfie")

    id_img     = decode_image(id_bytes,     "id_image")
    selfie_img = decode_image(selfie_bytes, "selfie")

    id_emb,     id_score     = extract_best_face(id_img,     "id_image")
    selfie_emb, selfie_score = extract_best_face(selfie_img, "selfie")

    similarity = cosine_similarity(id_emb, selfie_emb)
    match      = similarity >= Config.THRESHOLD
    confidence = score_to_confidence(similarity)

    elapsed = round(time.perf_counter() - t0, 3)
    logger.info(
        "compare | match=%s confidence=%s similarity=%.4f elapsed=%ss device=%s",
        match, confidence, similarity, elapsed, app_state.device,
    )

    return {
        "match":      match,
        "confidence": confidence,
        "similarity": round(similarity, 4),
        "threshold":  Config.THRESHOLD,
        "details": {
            "id_face_score":     round(id_score, 4),
            "selfie_face_score": round(selfie_score, 4),
            "processing_time_s": elapsed,
            "device":            app_state.device,
        },
    }