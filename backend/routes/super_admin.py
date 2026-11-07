"""
Platform Super Admin API.

The platform owner uses this to manage the DineFlow account itself:
create / edit / activate restaurants and issue owner credentials.
"""

from __future__ import annotations

from flask import Blueprint, g, request

from auth import create_session, destroy_session, current_session, super_admin_required
from dbcollections import (  # noqa: E402
    BILLS,
    CATEGORIES,
    MENU_ITEMS,
    ORDERS,
    OWNERS,
    PAYMENTS,
    RESTAURANTS,
    STAFF_REQUESTS,
    TABLES,
)
from config import config
from realtime import SUPER_ADMIN_ROOM, emit_to_super_admin
from store import get_store
from services.images import save_image, validate_image
from utils import (
    err,
    generate_password,
    generate_username,
    hash_password,
    new_id,
    now_iso,
    ok,
    unique_slug,
    verify_password,
)

bp = Blueprint("super_admin", __name__, url_prefix="/api/superadmin")


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #

@bp.post("/login")
def login():
    payload = request.get_json(silent=True) or {}
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""

    if not username or not password:
        return err("Username and password are required")

    if username != config.SUPER_ADMIN_USERNAME or password != config.SUPER_ADMIN_PASSWORD:
        # Keep the failure reason deliberately vague.
        return err("Invalid username or password", 401, "invalid_credentials")

    token = create_session("super_admin", username)
    return ok({"token": token, "username": username}, "Welcome back")


@bp.post("/logout")
def logout():
    destroy_session((current_session() or {}).get("token", ""))
    return ok(message="Logged out")


@bp.get("/session")
@super_admin_required
def session_info():
    return ok({"username": g.username, "role": "super_admin"})


# --------------------------------------------------------------------------- #
# Stats
# --------------------------------------------------------------------------- #

@bp.get("/stats")
@super_admin_required
def stats():
    store = get_store()
    restaurants = store.query(RESTAURANTS)
    active = [r for r in restaurants if r.get("status") == "active"]
    inactive = [r for r in restaurants if r.get("status") != "active"]

    return ok(
        {
            "total_restaurants": len(restaurants),
            "active_restaurants": len(active),
            "inactive_restaurants": len(inactive),
            "total_tables": store.count(TABLES),
            "total_orders": store.count(ORDERS),
            "total_menu_items": store.count(MENU_ITEMS),
            "total_revenue_collected": round(
                sum(float(b.get("total", 0) or 0) for b in store.query(BILLS)
                    if b.get("status") == "paid"),
                2,
            ),
            "recent_restaurants": [_public_restaurant(r) for r in restaurants[:6]],
        }
    )


# --------------------------------------------------------------------------- #
# Restaurant CRUD
# --------------------------------------------------------------------------- #

def _public_restaurant(restaurant: dict) -> dict:
    return {
        "id": restaurant.get("id"),
        "name": restaurant.get("name"),
        "slug": restaurant.get("slug"),
        "owner_name": restaurant.get("owner_name"),
        "phone": restaurant.get("phone"),
        "email": restaurant.get("email"),
        "address": restaurant.get("address"),
        "logo_url": restaurant.get("logo_url", ""),
        "status": restaurant.get("status", "active"),
        "created_at": restaurant.get("created_at"),
        "url": f"/r/{restaurant.get('slug')}",
    }


def _owner_doc(restaurant_id: str) -> dict | None:
    return get_store().get(OWNERS, restaurant_id)


def _all_usernames() -> set[str]:
    return {o.get("username", "") for o in get_store().query(OWNERS)}


def _all_slugs() -> set[str]:
    return {r.get("slug", "") for r in get_store().query(RESTAURANTS)}


@bp.get("/restaurants")
@super_admin_required
def list_restaurants():
    store = get_store()
    restaurants = store.query(RESTAURANTS, order_by="created_at", descending=True)
    rows = []
    for r in restaurants:
        row = _public_restaurant(r)
        owner = _owner_doc(r["id"])
        row["username"] = owner.get("username") if owner else ""
        row["tables"] = store.count(TABLES, [("restaurant_id", "==", r["id"])])
        row["orders"] = store.count(ORDERS, [("restaurant_id", "==", r["id"])])
        row["menu_items"] = store.count(MENU_ITEMS, [("restaurant_id", "==", r["id"])])
        rows.append(row)
    return ok(rows)


@bp.post("/restaurants")
@super_admin_required
def create_restaurant():
    payload = request.get_json(silent=True) or {}
    store = get_store()

    name = (payload.get("name") or "").strip()
    owner_name = (payload.get("owner_name") or "").strip()
    phone = (payload.get("phone") or "").strip()
    email = (payload.get("email") or "").strip()
    address = (payload.get("address") or "").strip()

    if not name:
        return err("Restaurant name is required")
    if not owner_name:
        return err("Restaurant owner name is required")

    usernames = _all_usernames()
    username = (payload.get("username") or "").strip() or generate_username(name, usernames)
    if username in usernames:
        return err(f"Username '{username}' is already taken", 409, "duplicate")

    password = (payload.get("password") or "").strip() or generate_password()
    slug = unique_slug(payload.get("slug") or name, _all_slugs())

    logo_url = (payload.get("logo_url") or "").strip()
    logo = request.files.get("logo")
    if logo and not validate_image(logo):
        logo_url = save_image(logo, folder="logos")

    restaurant_id = new_id("rst")
    restaurant = {
        "id": restaurant_id,
        "name": name,
        "slug": slug,
        "owner_name": owner_name,
        "phone": phone,
        "email": email,
        "address": address,
        "logo_url": logo_url,
        "status": "active",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    store.set(RESTAURANTS, restaurant_id, restaurant)
    store.set(
        OWNERS,
        restaurant_id,
        {
            "id": restaurant_id,
            "restaurant_id": restaurant_id,
            "username": username,
            "password_hash": hash_password(password),
            "name": owner_name,
            "created_at": now_iso(),
            "last_login": "",
        },
    )

    emit_to_super_admin("restaurant:created", _public_restaurant(restaurant))
    emit_to_super_admin("stats:changed", {})

    return ok(
        {
            "restaurant": _public_restaurant(restaurant),
            "credentials": {"username": username, "password": password},
        },
        "Restaurant created",
        201,
    )


@bp.get("/restaurants/<restaurant_id>")
@super_admin_required
def get_restaurant(restaurant_id: str):
    store = get_store()
    restaurant = store.get(RESTAURANTS, restaurant_id)
    if not restaurant:
        return err("Restaurant not found", 404, "not_found")

    owner = _owner_doc(restaurant_id)
    data = _public_restaurant(restaurant)
    data["username"] = owner.get("username", "") if owner else ""
    data["owner_created_at"] = owner.get("created_at") if owner else None
    data["owner_last_login"] = owner.get("last_login", "") if owner else ""
    data["counts"] = {
        "tables": store.count(TABLES, [("restaurant_id", "==", restaurant_id)]),
        "orders": store.count(ORDERS, [("restaurant_id", "==", restaurant_id)]),
        "menu_items": store.count(MENU_ITEMS, [("restaurant_id", "==", restaurant_id)]),
        "categories": store.count(CATEGORIES, [("restaurant_id", "==", restaurant_id)]),
        "staff_requests": store.count(
            STAFF_REQUESTS, [("restaurant_id", "==", restaurant_id)]
        ),
        "paid_bills": store.count(
            BILLS,
            [("restaurant_id", "==", restaurant_id), ("status", "==", "paid")],
        ),
    }
    revenue = sum(
        float(b.get("total", 0) or 0)
        for b in store.query(BILLS, [("restaurant_id", "==", restaurant_id)])
        if b.get("status") == "paid"
    )
    data["revenue_collected"] = round(revenue, 2)
    data["menu_url"] = f"/r/{restaurant.get('slug')}"
    return ok(data)


@bp.put("/restaurants/<restaurant_id>")
@super_admin_required
def update_restaurant(restaurant_id: str):
    store = get_store()
    restaurant = store.get(RESTAURANTS, restaurant_id)
    if not restaurant:
        return err("Restaurant not found", 404, "not_found")

    payload = request.get_json(silent=True) or {}
    allowed = {"name", "owner_name", "phone", "email", "address", "logo_url"}
    updates = {}
    for field in allowed:
        if field in payload and payload[field] is not None:
            if isinstance(payload[field], str) and field != "logo_url":
                updates[field] = payload[field].strip()
            else:
                updates[field] = payload[field]

    if "name" in updates and not updates["name"]:
        return err("Restaurant name cannot be empty")

    logo = request.files.get("logo")
    if logo and not validate_image(logo):
        updates["logo_url"] = save_image(logo, folder="logos")

    if not updates:
        return err("Nothing to update")

    updates["updated_at"] = now_iso()
    store.update(RESTAURANTS, restaurant_id, updates)

    if updates.get("owner_name"):
        owner = _owner_doc(restaurant_id)
        if owner:
            store.update(OWNERS, restaurant_id, {"name": updates["owner_name"]})

    updated = store.get(RESTAURANTS, restaurant_id)
    emit_to_super_admin("restaurant:updated", _public_restaurant(updated))
    return ok(_public_restaurant(updated), "Restaurant updated")


@bp.patch("/restaurants/<restaurant_id>/status")
@super_admin_required
def set_status(restaurant_id: str):
    store = get_store()
    restaurant = store.get(RESTAURANTS, restaurant_id)
    if not restaurant:
        return err("Restaurant not found", 404, "not_found")

    payload = request.get_json(silent=True) or {}
    status = (payload.get("status") or "").strip().lower()
    if status not in {"active", "inactive"}:
        return err("Status must be 'active' or 'inactive'")

    store.update(RESTAURANTS, restaurant_id, {"status": status, "updated_at": now_iso()})
    updated = store.get(RESTAURANTS, restaurant_id)
    emit_to_super_admin("restaurant:updated", _public_restaurant(updated))
    emit_to_super_admin("stats:changed", {})
    return ok(
        _public_restaurant(updated),
        "Restaurant activated" if status == "active" else "Restaurant deactivated",
    )


@bp.post("/restaurants/<restaurant_id>/reset-password")
@super_admin_required
def reset_password(restaurant_id: str):
    store = get_store()
    restaurant = store.get(RESTAURANTS, restaurant_id)
    if not restaurant:
        return err("Restaurant not found", 404, "not_found")

    owner = _owner_doc(restaurant_id)
    if not owner:
        return err("Owner account not found", 404, "not_found")

    payload = request.get_json(silent=True) or {}
    password = (payload.get("password") or "").strip() or generate_password()
    if len(password) < 6:
        return err("Password must be at least 6 characters")

    store.update(OWNERS, restaurant_id, {"password_hash": hash_password(password)})
    return ok({"password": password}, "Password reset")


@bp.put("/restaurants/<restaurant_id>/username")
@super_admin_required
def update_username(restaurant_id: str):
    store = get_store()
    if not store.get(RESTAURANTS, restaurant_id):
        return err("Restaurant not found", 404, "not_found")

    payload = request.get_json(silent=True) or {}
    username = (payload.get("username") or "").strip()
    if not username:
        return err("Username is required")
    if any(
        o.get("username") == username and o.get("id") != restaurant_id
        for o in store.query(OWNERS)
    ):
        return err(f"Username '{username}' is already taken", 409, "duplicate")

    store.update(OWNERS, restaurant_id, {"username": username})
    return ok({"username": username}, "Username updated")
