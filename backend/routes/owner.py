"""
Restaurant Owner API — authentication and dashboard overview.

Every owner is bound to exactly one ``restaurant_id`` and can only ever see
data belonging to that restaurant.
"""

from __future__ import annotations

from flask import Blueprint, g, request

from auth import create_session, destroy_session, current_session, owner_required
from dbcollections import (
    BILLS,
    CATEGORIES,
    MENU_ITEMS,
    ORDERS,
    OWNERS,
    RESTAURANTS,
    STAFF_REQUESTS,
    TABLES,
    TABLE_SESSIONS,
)
from store import get_store
from utils import err, is_today, money, now_iso, ok, verify_password

bp = Blueprint("owner", __name__, url_prefix="/api/owner")

ACTIVE_RESTAURANT_ERROR = "This restaurant is currently inactive. Contact the platform owner."


def _restaurant(restaurant_id: str) -> dict | None:
    return get_store().get(RESTAURANTS, restaurant_id)


def _require_active_restaurant(restaurant_id: str) -> tuple[dict | None, tuple | None]:
    restaurant = _restaurant(restaurant_id)
    if not restaurant:
        return None, err("Restaurant not found", 404, "not_found")
    if restaurant.get("status") != "active":
        return None, err(ACTIVE_RESTAURANT_ERROR, 403, "restaurant_inactive")
    return restaurant, None


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

    store = get_store()
    owners = store.query(OWNERS, [("username", "==", username)])
    if not owners:
        return err("Invalid username or password", 401, "invalid_credentials")

    owner = owners[0]
    if not verify_password(owner.get("password_hash", ""), password):
        return err("Invalid username or password", 401, "invalid_credentials")

    restaurant = _restaurant(owner.get("restaurant_id"))
    if not restaurant:
        return err("Restaurant not found", 404, "not_found")
    if restaurant.get("status") != "active":
        return err(ACTIVE_RESTAURANT_ERROR, 403, "restaurant_inactive")

    token = create_session(
        "owner",
        username,
        restaurant_id=restaurant["id"],
    )
    store.update(OWNERS, owner["id"], {"last_login": now_iso()})

    return ok(
        {
            "token": token,
            "username": username,
            "restaurant": {
                "id": restaurant["id"],
                "name": restaurant.get("name"),
                "slug": restaurant.get("slug"),
                "logo_url": restaurant.get("logo_url", ""),
                "address": restaurant.get("address", ""),
                "phone": restaurant.get("phone", ""),
            },
        },
        f"Welcome, {restaurant.get('owner_name') or username}",
    )


@bp.post("/logout")
def logout():
    destroy_session((current_session() or {}).get("token", ""))
    return ok(message="Logged out")


@bp.get("/me")
@owner_required
def me():
    restaurant = _restaurant(g.restaurant_id)
    if not restaurant:
        return err("Restaurant not found", 404, "not_found")
    if restaurant.get("status") != "active":
        return err(ACTIVE_RESTAURANT_ERROR, 403, "restaurant_inactive")
    return ok(
        {
            "username": g.username,
            "restaurant": {
                "id": restaurant["id"],
                "name": restaurant.get("name"),
                "slug": restaurant.get("slug"),
                "logo_url": restaurant.get("logo_url", ""),
                "address": restaurant.get("address", ""),
                "phone": restaurant.get("phone", ""),
                "email": restaurant.get("email", ""),
                "status": restaurant.get("status"),
                "url": f"/r/{restaurant.get('slug')}",
            },
        }
    )


# --------------------------------------------------------------------------- #
# Dashboard
# --------------------------------------------------------------------------- #

@bp.get("/dashboard")
@owner_required
def dashboard():
    restaurant, error = _require_active_restaurant(g.restaurant_id)
    if error:
        return error

    store = get_store()
    rid = g.restaurant_id

    orders = store.query(ORDERS, [("restaurant_id", "==", rid)])
    today_orders = [o for o in orders if is_today(o.get("created_at"))]

    def _status_count(rows, status):
        return len([o for o in rows if o.get("status") == status])

    open_sessions = store.query(
        TABLE_SESSIONS,
        [("restaurant_id", "==", rid), ("status", "==", "open")],
    )

    bills = store.query(BILLS, [("restaurant_id", "==", rid)])
    revenue_today = money(
        sum(
            float(o.get("total", 0) or 0)
            for o in today_orders
            if o.get("status") != "REJECTED"
        )
    )
    collected_today = money(
        sum(
            float(b.get("total", 0) or 0)
            for b in bills
            if b.get("status") == "paid" and is_today(b.get("paid_at"))
        )
    )

    recent = sorted(orders, key=lambda o: o.get("created_at", ""), reverse=True)[:8]
    pending_requests = [
        r
        for r in store.query(STAFF_REQUESTS, [("restaurant_id", "==", rid)])
        if r.get("status") == "pending"
    ]

    return ok(
        {
            "restaurant": {
                "id": restaurant["id"],
                "name": restaurant.get("name"),
                "slug": restaurant.get("slug"),
                "logo_url": restaurant.get("logo_url", ""),
                "address": restaurant.get("address", ""),
                "url": f"/r/{restaurant.get('slug')}",
            },
            "stats": {
                "today_orders": len(today_orders),
                "pending": _status_count(today_orders, "PENDING"),
                "preparing": _status_count(orders, "PREPARING")
                + _status_count(orders, "ACCEPTED"),
                "completed": _status_count(today_orders, "COMPLETED"),
                "today_revenue": revenue_today,
                "collected_today": collected_today,
                "menu_items": store.count(MENU_ITEMS, [("restaurant_id", "==", rid)]),
                "categories": store.count(CATEGORIES, [("restaurant_id", "==", rid)]),
                "tables": store.count(TABLES, [("restaurant_id", "==", rid)]),
                "open_sessions": len(open_sessions),
                "pending_requests": len(pending_requests),
                "total_orders": len(orders),
            },
            "recent_orders": recent,
            "pending_requests": pending_requests[:10],
        }
    )
