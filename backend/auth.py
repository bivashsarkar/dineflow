"""
Session based authentication for the Flask API.

Tokens are opaque random strings stored in the ``auth_sessions`` collection so
they can be revoked and inspected server-side. Roles:

* ``super_admin``  -> platform owner (DineFlow)
* ``owner``        -> restaurant owner, always bound to a restaurant_id

Customers never authenticate - they are identified by the QR table token.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from functools import wraps

from flask import request, g

from config import config
from store import get_store
from utils import err, now_iso

SESSIONS = "auth_sessions"


def create_session(role: str, username: str, restaurant_id: str | None = None) -> str:
    import secrets

    store = get_store()
    token = secrets.token_urlsafe(32)
    expires = (datetime.now() + timedelta(hours=config.SESSION_TTL_HOURS)).isoformat(
        timespec="seconds"
    )
    store.set(
        SESSIONS,
        token,
        {
            "token": token,
            "role": role,
            "username": username,
            "restaurant_id": restaurant_id or "",
            "created_at": now_iso(),
            "expires_at": expires,
        },
    )
    return token


def destroy_session(token: str) -> None:
    if token:
        get_store().delete(SESSIONS, token)


def resolve_session(token: str | None) -> dict | None:
    if not token:
        return None
    store = get_store()
    session = store.get(SESSIONS, token)
    if not session:
        return None
    if session.get("expires_at") and session["expires_at"] < now_iso():
        store.delete(SESSIONS, token)
        return None
    return session


def _extract_token() -> str | None:
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        return header[7:].strip()
    if request.headers.get("X-Auth-Token"):
        return request.headers["X-Auth-Token"].strip()
    # Socket.IO handshakes and simple forms can pass it as a query param.
    return request.args.get("token")


def attach_session():
    """Flask before_request hook: make the current session available as ``g.session``."""
    g.session = resolve_session(_extract_token())


def login_required(roles: tuple[str, ...] = ("super_admin", "owner")):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            session = getattr(g, "session", None)
            if not session:
                return err("Authentication required", 401, "unauthorized")
            if session.get("role") not in roles:
                return err("You do not have access to this resource", 403, "forbidden")
            g.session_role = session["role"]
            g.restaurant_id = session.get("restaurant_id") or ""
            g.username = session.get("username") or ""
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def owner_required(fn):
    """Only restaurant owners, and always scoped to their own restaurant."""
    return login_required(("owner",))(fn)


def super_admin_required(fn):
    return login_required(("super_admin",))(fn)


def current_session() -> dict | None:
    return getattr(g, "session", None)
