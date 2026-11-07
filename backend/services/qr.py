"""QR code generation for table menus."""

from __future__ import annotations

import base64
import io
from pathlib import Path

import qrcode
from qrcode.image.styledpil import StyledPilImage  # noqa: F401  (kept for future styling)

from config import BASE_DIR, config

QR_DIR = BASE_DIR / "qr_codes"

# Brand colours (kept high-contrast so every phone camera scans reliably).
INK = "#221E1A"
PAPER = "#FFFFFF"
BRAND = "#F96A16"


def table_url(slug: str, table_token: str) -> str:
    """Absolute URL encoded inside a table's QR code."""
    return f"{config.PUBLIC_BASE_URL}/r/{slug}/table/{table_token}"


def make_qr(url: str) -> qrcode.QRCode:
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=2,
    )
    qr.add_data(url)
    qr.make(fit=True)
    return qr


def qr_png_bytes(url: str) -> bytes:
    img = make_qr(url).make_image(fill_color=INK, back_color=PAPER)
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()


def qr_data_url(url: str) -> str:
    raw = base64.b64encode(qr_png_bytes(url)).decode("ascii")
    return f"data:image/png;base64,{raw}"


def save_qr(url: str, filename: str) -> str:
    """Write a QR image to disk and return its public path."""
    QR_DIR.mkdir(parents=True, exist_ok=True)
    safe = "".join(c for c in filename if c.isalnum() or c in "-_") or "qr"
    path = QR_DIR / f"{safe}.png"
    path.write_bytes(qr_png_bytes(url))
    return f"/qr/{path.name}"


def qr_file_url(url: str, filename: str) -> str:
    """Reuse an already generated QR file, generating it on demand."""
    QR_DIR.mkdir(parents=True, exist_ok=True)
    safe = "".join(c for c in filename if c.isalnum() or c in "-_") or "qr"
    path: Path = QR_DIR / f"{safe}.png"
    if not path.exists():
        path.write_bytes(qr_png_bytes(url))
    return f"/qr/{path.name}"


def qr_directory() -> Path:
    QR_DIR.mkdir(parents=True, exist_ok=True)
    return QR_DIR
