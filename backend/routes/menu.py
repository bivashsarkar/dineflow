"""
Menu management: categories, food items, availability and replacements.

All endpoints are scoped to the authenticated owner's restaurant.
"""

from __future__ import annotations

from flask import Blueprint, g, request

from auth import owner_required
from dbcollections import (
    CATEGORIES,
    MENU_ITEMS,
    ORDERS,
    REPLACEMENT_REQUESTS,
)
from realtime import emit_to_customer, emit_to_owner
from services.images import delete_image, save_image, validate_image
from services.orders import ACTIVE_ORDER_STATUSES, COOKING_STATUSES, effective_price
from store import get_store
from utils import err, money, new_id, now_iso, ok

bp = Blueprint("owner_menu", __name__, url_prefix="/api/owner")


def _scope() -> list[tuple]:
    return [("restaurant_id", "==", g.restaurant_id)]


def _find(collection: str, doc_id: str, message: str = "Not found"):
    doc = get_store().get(collection, doc_id)
    if not doc or doc.get("restaurant_id") != g.restaurant_id:
        return None, err(message, 404, "not_found")
    return doc, None


def serialize_item(item: dict) -> dict:
    return {
        "id": item.get("id"),
        "restaurant_id": item.get("restaurant_id"),
        "category_id": item.get("category_id", ""),
        "name": item.get("name"),
        "description": item.get("description", ""),
        "price": money(item.get("price")),
        "offer_price": money(item.get("offer_price")),
        "special_offer": bool(item.get("special_offer")),
        "offer_text": item.get("offer_text", ""),
        "image_url": item.get("image_url", ""),
        "veg": bool(item.get("veg")),
        "available": bool(item.get("available", True)),
        "bestseller": bool(item.get("bestseller")),
        "created_at": item.get("created_at"),
        "updated_at": item.get("updated_at"),
    }


# --------------------------------------------------------------------------- #
# Categories
# --------------------------------------------------------------------------- #

@bp.get("/categories")
@owner_required
def list_categories():
    store = get_store()
    rows = store.query(CATEGORIES, _scope(), order_by="sort_order")
    for row in rows:
        row["item_count"] = store.count(
            MENU_ITEMS, [("restaurant_id", "==", g.restaurant_id),
                         ("category_id", "==", row["id"])]
        )
    return ok(rows)


@bp.post("/categories")
@owner_required
def create_category():
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    if not name:
        return err("Category name is required")

    store = get_store()
    existing = store.query(CATEGORIES, _scope())
    if any(c.get("name", "").lower() == name.lower() for c in existing):
        return err("A category with this name already exists", 409, "duplicate")

    category_id = new_id("cat")
    sort_order = int(payload.get("sort_order") or (len(existing) + 1) * 10)
    store.set(
        CATEGORIES,
        category_id,
        {
            "id": category_id,
            "restaurant_id": g.restaurant_id,
            "name": name,
            "sort_order": sort_order,
            "created_at": now_iso(),
        },
    )
    return ok(store.get(CATEGORIES, category_id), "Category added", 201)


@bp.put("/categories/<category_id>")
@owner_required
def update_category(category_id: str):
    category, error = _find(CATEGORIES, category_id, "Category not found")
    if error:
        return error

    payload = request.get_json(silent=True) or {}
    updates = {}
    if "name" in payload:
        name = (payload.get("name") or "").strip()
        if not name:
            return err("Category name cannot be empty")
        updates["name"] = name
    if "sort_order" in payload:
        updates["sort_order"] = int(payload.get("sort_order") or 0)

    if updates:
        get_store().update(CATEGORIES, category_id, updates)
    return ok(get_store().get(CATEGORIES, category_id), "Category updated")


@bp.delete("/categories/<category_id>")
@owner_required
def delete_category(category_id: str):
    category, error = _find(CATEGORIES, category_id, "Category not found")
    if error:
        return error

    store = get_store()
    item_count = store.count(
        MENU_ITEMS,
        [("restaurant_id", "==", g.restaurant_id), ("category_id", "==", category_id)],
    )
    if item_count:
        return err(
            f"Move or delete the {item_count} item(s) in this category first",
            409,
            "category_not_empty",
        )
    store.delete(CATEGORIES, category_id)
    return ok(message="Category deleted")


# --------------------------------------------------------------------------- #
# Menu items
# --------------------------------------------------------------------------- #

@bp.get("/menu")
@owner_required
def list_menu():
    store = get_store()
    rows = store.query(MENU_ITEMS, _scope(), order_by="created_at", descending=True)
    return ok([serialize_item(r) for r in rows])


def _read_item_payload(payload: dict, partial: bool = False) -> tuple[dict | None, tuple | None]:
    data = {}

    if not partial or "name" in payload:
        name = (payload.get("name") or "").strip()
        if not name:
            return None, err("Food name is required")
        data["name"] = name

    if "description" in payload or not partial:
        data["description"] = (payload.get("description") or "").strip()

    if not partial or "price" in payload:
        try:
            price = float(payload.get("price") or 0)
        except (TypeError, ValueError):
            return None, err("Price must be a number")
        if price < 0:
            return None, err("Price cannot be negative")
        data["price"] = money(price)

    for field in ("category_id", "image_url", "offer_text"):
        if field in payload:
            data[field] = (payload.get(field) or "").strip()

    for field in ("veg", "available", "bestseller", "special_offer"):
        if field in payload:
            data[field] = bool(payload.get(field))

    if "offer_price" in payload:
        try:
            data["offer_price"] = money(float(payload.get("offer_price") or 0))
        except (TypeError, ValueError):
            return None, err("Offer price must be a number")

    return data, None


@bp.post("/menu")
@owner_required
def create_menu_item():
    payload = request.get_json(silent=True) or {}
    data, error = _read_item_payload(payload, partial=False)
    if error:
        return error

    image = request.files.get("image")
    if image and not validate_image(image):
        data["image_url"] = save_image(image, folder="food")

    data.setdefault("available", True)
    data.setdefault("veg", False)
    data.setdefault("bestseller", False)
    data.setdefault("special_offer", False)
    data.setdefault("offer_price", 0)
    data.setdefault("offer_text", "")
    data.setdefault("image_url", "")
    data.setdefault("category_id", "")
    data.setdefault("description", "")

    item_id = new_id("itm")
    record = {
        "id": item_id,
        "restaurant_id": g.restaurant_id,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        **data,
    }
    get_store().set(MENU_ITEMS, item_id, record)
    return ok(serialize_item(record), "Menu item added", 201)


@bp.put("/menu/<item_id>")
@owner_required
def update_menu_item(item_id: str):
    item, error = _find(MENU_ITEMS, item_id, "Menu item not found")
    if error:
        return error

    payload = request.get_json(silent=True) or {}
    data, error = _read_item_payload(payload, partial=True)
    if error:
        return error

    image = request.files.get("image")
    if image and not validate_image(image):
        if item.get("image_url", "").startswith("/uploads/"):
            delete_image(item["image_url"])
        data["image_url"] = save_image(image, folder="food")

    if not data:
        return err("Nothing to update")

    data["updated_at"] = now_iso()
    get_store().update(MENU_ITEMS, item_id, data)
    return ok(serialize_item(get_store().get(MENU_ITEMS, item_id)), "Menu item updated")


@bp.delete("/menu/<item_id>")
@owner_required
def delete_menu_item(item_id: str):
    item, error = _find(MENU_ITEMS, item_id, "Menu item not found")
    if error:
        return error

    store = get_store()
    active = [
        o
        for o in store.query(ORDERS, [("restaurant_id", "==", g.restaurant_id)])
        if o.get("status") in ACTIVE_ORDER_STATUSES
        and any(i.get("menu_item_id") == item_id for i in o.get("items", []))
    ]
    if active:
        return err(
            "This item is part of an active order. Mark it unavailable instead.",
            409,
            "item_in_active_order",
        )

    store.delete(MENU_ITEMS, item_id)
    return ok(message="Menu item deleted")


@bp.patch("/menu/<item_id>/availability")
@owner_required
def set_availability(item_id: str):
    item, error = _find(MENU_ITEMS, item_id, "Menu item not found")
    if error:
        return error

    payload = request.get_json(silent=True) or {}
    if "available" not in payload:
        return err("'available' is required")
    available = bool(payload.get("available"))

    get_store().update(
        MENU_ITEMS, item_id, {"available": available, "updated_at": now_iso()}
    )
    return ok(
        serialize_item(get_store().get(MENU_ITEMS, item_id)),
        "Item marked available" if available else "Item marked unavailable",
    )


@bp.post("/menu/<item_id>/unavailable")
@owner_required
def mark_unavailable_with_replacement(item_id: str):
    """
    Mark a food item unavailable and offer an alternative to every customer
    that has it inside a live order.
    """
    item, error = _find(MENU_ITEMS, item_id, "Menu item not found")
    if error:
        return error

    payload = request.get_json(silent=True) or {}
    replacement_id = (payload.get("replacement_item_id") or "").strip()
    replacement = None

    store = get_store()
    if replacement_id:
        replacement, error = _find(
            MENU_ITEMS, replacement_id, "Replacement item not found"
        )
        if error:
            return error
        if replacement["id"] == item["id"]:
            return err("Choose a different item as the replacement")
        if not replacement.get("available", True):
            return err("The replacement item is also unavailable")

    active_orders = [
        o
        for o in store.query(
            ORDERS,
            [("restaurant_id", "==", g.restaurant_id),
             ("status", "in", list(COOKING_STATUSES))],
        )
        if any(i.get("menu_item_id") == item_id for i in o.get("items", []))
    ]

    if active_orders and replacement is None:
        return err(
            "This item is inside active orders — select a replacement item first",
            409,
            "replacement_required",
        )

    store.update(MENU_ITEMS, item_id, {"available": False, "updated_at": now_iso()})

    created = []
    for order in active_orders:
        # One pending proposal per order/item.
        existing = store.query(
            REPLACEMENT_REQUESTS,
            [("restaurant_id", "==", g.restaurant_id),
             ("order_id", "==", order["id"]),
             ("original_item_id", "==", item_id),
             ("status", "==", "pending")],
        )
        if existing:
            continue

        request_id = new_id("rpl")
        original_line = next(
            (i for i in order.get("items", []) if i.get("menu_item_id") == item_id), {}
        )
        record = {
            "id": request_id,
            "restaurant_id": g.restaurant_id,
            "order_id": order["id"],
            "table_id": order.get("table_id", ""),
            "table_token": order.get("table_token", ""),
            "table_number": order.get("table_number", ""),
            "session_id": order.get("session_id", ""),
            "original_item_id": item_id,
            "original_name": item.get("name", ""),
            "original_price": money(original_line.get("price", 0)),
            "original_qty": int(original_line.get("qty", 1)),
            "replacement_item_id": replacement["id"] if replacement else "",
            "replacement_name": replacement.get("name", "") if replacement else "",
            "replacement_price": effective_price(replacement) if replacement else 0,
            "replacement_image": replacement.get("image_url", "") if replacement else "",
            "status": "pending",
            "created_at": now_iso(),
            "responded_at": "",
        }
        store.set(REPLACEMENT_REQUESTS, request_id, record)
        created.append(record)

        emit_to_customer(
            g.restaurant_id,
            order.get("table_token", ""),
            "replacement:new",
            _customer_view(record),
        )

    emit_to_owner(
        g.restaurant_id,
        "menu:changed",
        {"item_id": item_id, "available": False, "replacements": len(created)},
    )

    return ok(
        {"replacements_created": len(created)},
        f"'{item.get('name')}' marked unavailable"
        + (f" · {len(created)} customer(s) notified" if created else ""),
    )


def _customer_view(record: dict) -> dict:
    return {
        "id": record.get("id"),
        "order_id": record.get("order_id"),
        "original_name": record.get("original_name"),
        "original_price": record.get("original_price"),
        "original_qty": record.get("original_qty"),
        "replacement_name": record.get("replacement_name"),
        "replacement_price": record.get("replacement_price"),
        "replacement_image": record.get("replacement_image"),
        "table_number": record.get("table_number"),
        "status": record.get("status"),
        "created_at": record.get("created_at"),
    }
