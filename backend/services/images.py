"""Image uploads -> Cloudinary (production) or local disk (development)."""

from __future__ import annotations

import re
import secrets
from pathlib import Path

from werkzeug.utils import secure_filename

from config import config

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif", "svg"}
ALLOWED_MIME_PREFIX = ("image/",)

_cloudinary_ready: bool | None = None


def _configure_cloudinary() -> bool:
    global _cloudinary_ready
    if _cloudinary_ready is not None:
        return _cloudinary_ready

    if not config.cloudinary_configured():
        _cloudinary_ready = False
        return False

    try:
        import cloudinary

        cloudinary.config(
            cloud_name=config.CLOUDINARY_CLOUD_NAME,
            api_key=config.CLOUDINARY_API_KEY,
            api_secret=config.CLOUDINARY_API_SECRET,
            secure=True,
        )
        _cloudinary_ready = True
    except Exception:  # pragma: no cover - defensive
        _cloudinary_ready = False
    return _cloudinary_ready


def storage_backend() -> str:
    return "cloudinary" if _configure_cloudinary() else "local"


def _extension(filename: str) -> str:
    name = secure_filename(filename or "")
    if "." not in name:
        return "png"
    ext = name.rsplit(".", 1)[-1].lower()
    return ext if ext in ALLOWED_EXTENSIONS else "png"


def validate_image(file) -> str | None:
    """Return an error message when the upload is not acceptable."""
    if file is None or not getattr(file, "filename", ""):
        return "No file selected"
    filename = secure_filename(file.filename)
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    mime = (file.mimetype or "").lower()
    if ext not in ALLOWED_EXTENSIONS and not mime.startswith(ALLOWED_MIME_PREFIX):
        return "Only image files are allowed (png, jpg, jpeg, webp, gif, svg)"
    return None


def save_image(file, folder: str = "dineflow") -> str:
    """
    Persist an uploaded image and return its public URL.

    Cloudinary is used when credentials are present; otherwise the file is
    written to ``UPLOAD_FOLDER`` and served by Flask at ``/uploads/<file>``.
    """
    error = validate_image(file)
    if error:
        raise ValueError(error)

    ext = _extension(file.filename)
    stamp = secrets.token_hex(6)

    if _configure_cloudinary():
        import cloudinary.uploader

        result = cloudinary.uploader.upload(
            file,
            folder=f"dineflow/{folder}",
            resource_type="image",
            public_id=stamp,
            overwrite=True,
        )
        return result.get("secure_url") or result.get("url")

    config.UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
    name = f"{folder}_{stamp}.{ext}"
    target = config.UPLOAD_FOLDER / name
    file.save(str(target))
    return f"/uploads/{name}"


def delete_image(url: str) -> None:
    """Best-effort cleanup for local uploads (Cloudinary assets are left intact)."""
    if not url or not url.startswith("/uploads/"):
        return
    name = re.sub(r"[^A-Za-z0-9._-]", "", url.split("/")[-1])
    if not name:
        return
    path: Path = config.UPLOAD_FOLDER / name
    try:
        if path.exists() and path.is_file():
            path.unlink()
    except OSError:
        pass
