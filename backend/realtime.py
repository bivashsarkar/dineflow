"""
Flask-SocketIO setup and typed emit helpers.

Rooms
-----
``super_admin``                          platform owner dashboard
``owner:<restaurant_id>``                a restaurant's owner dashboard
``cust:<restaurant_id>:<table_token>``   the customer screen for one table
"""

from __future__ import annotations

from flask_socketio import SocketIO, emit, join_room, leave_room

from auth import resolve_session

socketio = SocketIO(
    cors_allowed_origins="*",
    async_mode="threading",
    ping_timeout=30,
    ping_interval=25,
)

# Room name helpers -------------------------------------------------------- #

SUPER_ADMIN_ROOM = "super_admin"


def owner_room(restaurant_id: str) -> str:
    return f"owner:{restaurant_id}"


def customer_room(restaurant_id: str, table_token: str) -> str:
    return f"cust:{restaurant_id}:{table_token}"


# Emit helpers ------------------------------------------------------------- #

def emit_to_owner(restaurant_id: str, event: str, payload: dict) -> None:
    socketio.emit(event, payload, to=owner_room(restaurant_id))


def emit_to_customer(restaurant_id: str, table_token: str, event: str, payload: dict) -> None:
    socketio.emit(event, payload, to=customer_room(restaurant_id, table_token))


def emit_to_super_admin(event: str, payload: dict) -> None:
    socketio.emit(event, payload, to=SUPER_ADMIN_ROOM)


# Connection handling ------------------------------------------------------ #

@socketio.on("connect")
def on_connect(auth: dict | None = None):
    """Authenticate the socket using the same token as the REST API."""
    token = None
    if isinstance(auth, dict):
        token = auth.get("token")
    if not token:
        token = None
    session = resolve_session(token) if token else None

    if session:
        sid_token = session.get("token")
        request_scope = _request_sid_token(sid_token)
        if request_scope:
            join_room(request_scope)
    return True


def _request_sid_token(token: str) -> str | None:
    session = resolve_session(token)
    if not session:
        return None
    if session["role"] == "super_admin":
        return SUPER_ADMIN_ROOM
    if session["role"] == "owner":
        return owner_room(session.get("restaurant_id") or "")
    return None


@socketio.on("join")
def on_join(data: dict | None = None):
    """
    Explicit room join.

    * Owners join their own restaurant room (validated against their session).
    * Customers join their table room; the room name embeds the table token so
      a customer can only listen to the table encoded in their QR code.
    """
    from flask import request as flask_request

    data = data or {}
    role = data.get("role")
    token = data.get("token")
    session = resolve_session(token) if token else None

    if role == "owner":
        if not session or session.get("role") != "owner":
            return {"ok": False, "error": "unauthorized"}
        room = owner_room(session.get("restaurant_id") or "")
        join_room(room)
        return {"ok": True, "room": room}

    if role == "customer":
        restaurant_id = str(data.get("restaurant_id") or "").strip()
        table_token = str(data.get("table_token") or "").strip()
        if not restaurant_id or not table_token:
            return {"ok": False, "error": "bad_request"}
        room = customer_room(restaurant_id, table_token)
        join_room(room)
        return {"ok": True, "room": room}

    if role == "super_admin":
        if not session or session.get("role") != "super_admin":
            return {"ok": False, "error": "unauthorized"}
        join_room(SUPER_ADMIN_ROOM)
        return {"ok": True, "room": SUPER_ADMIN_ROOM}

    return {"ok": False, "error": "bad_request"}


@socketio.on("leave")
def on_leave(data: dict | None = None):
    data = data or {}
    room = data.get("room")
    if room:
        leave_room(room)
    return {"ok": True}


@socketio.on("disconnect")
def on_disconnect():
    pass
