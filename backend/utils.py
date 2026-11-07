"""Shared helpers: identifiers, slugs, password hashing, responses, time."""

from __future__ import annotations

import re
import secrets
from datetime import datetime

from flask import jsonify
from werkzeug.security import generate_password_hash, check_password_hash


# --------------------------------------------------------------------------- #
# Responses
# --------------------------------------------------------------------------- #

def ok(data=None, message: str = "ok", status: int = 200):
    body = {"success": True, "message": message}
    if data is not None:
        body["data"] = data
    return jsonify(body), status


def err(message: str, status: int = 400, code: str = "bad_request"):
    return jsonify({"success": False, "message": message, "code": code}), status


# --------------------------------------------------------------------------- #
# Time
# --------------------------------------------------------------------------- #

def now_iso() -> str:
    """Local time as an ISO string (sortable, JSON friendly, human readable)."""
    return datetime.now().isoformat(timespec="seconds")


def today_key() -> str:
    return datetime.now().date().isoformat()


def is_today(value: str | None) -> bool:
    return bool(value) and str(value)[:10] == today_key()


# --------------------------------------------------------------------------- #
# Identifiers & slugs
# --------------------------------------------------------------------------- #

def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(6)}"


def new_token(prefix: str = "tok") -> str:
    return f"{prefix}_{secrets.token_urlsafe(16).replace('-', '').replace('_', '')[:20]}"


def slugify(text: str) -> str:
    text = (text or "").lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-") or "restaurant"


def unique_slug(base: str, existing: set[str]) -> str:
    slug = slugify(base)
    if slug not in existing:
        return slug
    n = 2
    while f"{slug}-{n}" in existing:
        n += 1
    return f"{slug}-{n}"


def generate_username(name: str, existing: set[str]) -> str:
    base = slugify(name).replace("-", "_")
    base = re.sub(r"_+", "_", base).strip("_") or "owner"
    if not any(ch.isdigit() for ch in base):
        pass
    candidate = f"{base}_admin"
    if candidate not in existing:
        return candidate
    n = 2
    while f"{base}{n}_admin" in existing:
        n += 1
    return f"{base}{n}_admin"


def generate_password(length: int = 10) -> str:
    alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(length))


# --------------------------------------------------------------------------- #
# Passwords
# --------------------------------------------------------------------------- #

def hash_password(password: str) -> str:
    return generate_password_hash(password)


def verify_password(hashed: str, password: str) -> bool:
    try:
        return check_password_hash(hashed or "", password or "")
    except (ValueError, TypeError):
        return False


# --------------------------------------------------------------------------- #
# Money
# --------------------------------------------------------------------------- #

def money(value) -> float:
    try:
        return round(float(value or 0), 2)
    except (TypeError, ValueError):
        return 0.0
