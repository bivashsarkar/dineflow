"""Image upload endpoints (owner logos and food photos)."""

from __future__ import annotations

from flask import Blueprint, g, request

from auth import login_required, super_admin_required
from services.images import save_image, storage_backend, validate_image
from utils import err, ok

bp = Blueprint("upload", __name__, url_prefix="/api/upload")


@bp.post("/owner")
@login_required(("owner",))
def upload_owner_image():
    file = request.files.get("image")
    error = validate_image(file)
    if error:
        return err(error)
    url = save_image(file, folder=request.args.get("folder", "food"))
    return ok({"url": url, "backend": storage_backend()}, "Image uploaded", 201)


@bp.post("/admin")
@super_admin_required
def upload_admin_image():
    file = request.files.get("image")
    error = validate_image(file)
    if error:
        return err(error)
    url = save_image(file, folder=request.args.get("folder", "logos"))
    return ok({"url": url, "backend": storage_backend()}, "Image uploaded", 201)
