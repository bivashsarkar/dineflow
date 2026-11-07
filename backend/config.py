"""
DineFlow backend configuration.

All secrets are read from environment variables (optionally loaded from a
`.env` file). Nothing sensitive is ever shipped to the frontend.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def _bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class Config:
    # ------------------------------------------------------------------ #
    # Core
    # ------------------------------------------------------------------ #
    SECRET_KEY = os.getenv("DINEFLOW_SECRET_KEY", "dineflow-dev-secret-change-me")
    DEBUG = _bool("DINEFLOW_DEBUG", True)
    HOST = os.getenv("DINEFLOW_HOST", "0.0.0.0")
    PORT = int(os.getenv("DINEFLOW_PORT", "5000"))

    # Super admin credentials (never exposed to the frontend).
    SUPER_ADMIN_USERNAME = os.getenv("DINEFLOW_ADMIN_USERNAME", "bivash")
    SUPER_ADMIN_PASSWORD = os.getenv("DINEFLOW_ADMIN_PASSWORD", "dineflow@123")

    # ------------------------------------------------------------------ #
    # Database
    # ------------------------------------------------------------------ #
    # "firestore" -> Firebase Firestore (production)
    # "local"     -> JSON file store (development / no Firebase project yet)
    # "auto"      -> firestore when credentials exist, otherwise local
    DB_BACKEND = os.getenv("DINEFLOW_DB_BACKEND", "auto").strip().lower()

    FIREBASE_CREDENTIALS = os.getenv("FIREBASE_CREDENTIALS", "")
    FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "")
    LOCAL_DATA_DIR = Path(os.getenv("DINEFLOW_DATA_DIR", str(BASE_DIR / "data")))

    # ------------------------------------------------------------------ #
    # Cloudinary image storage
    # ------------------------------------------------------------------ #
    CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME", "")
    CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY", "")
    CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET", "")
    UPLOAD_FOLDER = Path(os.getenv("DINEFLOW_UPLOAD_FOLDER", str(BASE_DIR / "uploads")))
    MAX_CONTENT_LENGTH = int(os.getenv("DINEFLOW_MAX_UPLOAD_MB", "8")) * 1024 * 1024

    # ------------------------------------------------------------------ #
    # Billing
    # ------------------------------------------------------------------ #
    GST_RATE = float(os.getenv("DINEFLOW_GST_RATE", "5.0"))  # restaurant GST (%)

    # ------------------------------------------------------------------ #
    # Auth
    # ------------------------------------------------------------------ #
    SESSION_TTL_HOURS = int(os.getenv("DINEFLOW_SESSION_TTL_HOURS", "12"))

    # ------------------------------------------------------------------ #
    # Realtime
    # ------------------------------------------------------------------ #
    SOCKETIO_PING_TIMEOUT = 30
    SOCKETIO_PING_INTERVAL = 25

    # ------------------------------------------------------------------ #
    # URLs
    # ------------------------------------------------------------------ #
    # Public base URL used when building QR codes (no trailing slash).
    PUBLIC_BASE_URL = os.getenv("DINEFLOW_PUBLIC_BASE_URL", "http://localhost:5173").rstrip("/")

    @classmethod
    def cloudinary_configured(cls) -> bool:
        return bool(
            cls.CLOUDINARY_CLOUD_NAME
            and cls.CLOUDINARY_API_KEY
            and cls.CLOUDINARY_API_SECRET
        )

    @classmethod
    def firestore_configured(cls) -> bool:
        if cls.FIREBASE_CREDENTIALS and Path(cls.FIREBASE_CREDENTIALS).exists():
            return True
        # gcloud / service account defaults
        if os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
            return True
        return False

    @classmethod
    def resolve_db_backend(cls) -> str:
        if cls.DB_BACKEND in {"firestore", "local"}:
            return cls.DB_BACKEND
        return "firestore" if cls.firestore_configured() else "local"


config = Config()
