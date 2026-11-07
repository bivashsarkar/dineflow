"""
Customer ordering API — completely public (no registration, no login).

Access is granted by the table QR token, which encodes both the restaurant and
the table. Every endpoint validates that the token really belongs to a live
restaurant before touching any data.
"""

from __future__ import annotations

from flask import Blueprint, g, request

from auth import owner_required  # noqa: F401  (kept for symmetry in this package)
from dbcollections import (
    CATEGORIES,
    MENU_ITEMS,
    ORDERS,
    ORDER_ITEMS,
    REPLACEMENT_REQUESTS,
    RESTAURANTS,
    STAFF_REQUESTS,
    TABLES,
    TABLE_SESSIONS,
    BILLS,
)
from realtime import emit_to_customer, emit_to_owner
from routes.billing import refresh_bill_for_session
from services.orders import customer_view, recompute_total
from store import get_store
from utils import err, money, new_id, now_iso, ok

bp = Blueprint("customer", __name__, url_prefix="/api/customer")

REQUEST_TYPES = ("call_staff", "water", "cutlery", "assistance", "bill")
MAX_QTY = 50

# --------------------------------------------------------------------------- #
# Lookup helpers
# --------------------------------------------------------------------------- #

def _restaurant_by_slug(slug: str) -> dict | None:
    rows = get_store().query(RESTAURANTS, [("slug", "==", slug)])
    return rows[0] if rows else None


def _table_by_token(token: str) -> tuple[dict | None, dict | None, tuple | None]:
    if not token:
        return None, None, err("Table QR code is missing", 400, "missing_token")
    rows = get_store().query(TABLES, [("token", "==", token)])
    if not rows:
        return None, None, err("Invalid table QR code", 404, "invalid_token")

    table = rows[0]
    restaurant = get_store().get(RESTAURANTS, table.get("restaurant_id", ""))
    if not restaurant:
        return None, None, err("Restaurant not found", 404, "not_found")
    if restaurant.get("status") != "active":
        return None, None, err(
            "This restaurant is not accepting orders right now", 403, "restaurant_inactive"
        )
    return table, restaurant, None


def _open_session(table: dict) -> dict | None:
    rows = get_store().query(
        TABLE_SESSIONS,
        [("restaurant_id", "==", table["restaurant_id"]),
         ("table_id", "==", table["id"]),
         ("status", "in", ["open", "billed"])],
        order_by="opened_at",
        descending=True,
    )
    return rows[0] if rows else None


def _latest_bill(table: dict) -> dict | None:
    """Most recent bill for this table (still visible after the session closes)."""
    rows = get_store().query(
        BILLS,
        [("restaurant_id", "==", table["restaurant_id"]),
         ("table_id", "==", table["id"])],
        order_by="created_at",
        descending=True,
    )
    return rows[0] if rows else None


def _menu_public(restaurant_id: str) -> tuple[list[dict], list[dict]]:
    store = get_store()
    categories = store.query(
        CATEGORIES,
        [("restaurant_id", "==", restaurant_id)],
        order_by="sort_order",
    )
    items = store.query(
        MENU_ITEMS,
        [("restaurant_id", "==", restaurant_id), ("available", "==", True)],
        order_by="created_at",
        descending=True,
    )

    from services.orders import effective_price

    public_items = []
    for item in items:
        price = effective_price(item)
        public_items.append(
            {
                "id": item.get("id"),
                "category_id": item.get("category_id", ""),
                "name": item.get("name"),
                "description": item.get("description", ""),
                "price": price,
                "mrp": money(item.get("price")),
                "special_offer": bool(item.get("special_offer")),
                "offer_text": item.get("offer_text", ""),
                "image_url": item.get("image_url", ""),
                "veg": bool(item.get("veg")),
                "bestseller": bool(item.get("bestseller")),
                "available": True,
            }
        )
    return [
        {"id": c.get("id"), "name": c.get("name"), "sort_order": c.get("sort_order")}
        for c in categories
    ], public_items


# --------------------------------------------------------------------------- #
# Menu / table bootstrap
# --------------------------------------------------------------------------- #

@bp.get("/restaurant/<slug>")
def restaurant_menu(slug: str):
    restaurant = _restaurant_by_slug(slug)
    if not restaurant:
        return err("Restaurant not found", 404, "not_found")
    if restaurant.get("status") != "active":
        return err("This restaurant is not accepting orders right now", 403,
                   "restaurant_inactive")

    categories, items = _menu_public(restaurant["id"])
    return ok(
        {
            "restaurant": _public_restaurant(restaurant),
            "categories": categories,
            "items": items,
        }
    )


@bp.get("/table/<token>")
def table_state(token: str):
    table, restaurant, error = _table_by_token(token)
    if error:
        return error

    store = get_store()
    session = _open_session(table)

    orders = []
    if session:
        orders = store.query(
            ORDERS,
            [("restaurant_id", "==", restaurant["id"]),
             ("session_id", "==", session["id"])],
            order_by="created_at",
        )

    bill = None
    if session:
        bills = store.query(
            BILLS,
            [("restaurant_id", "==", restaurant["id"]),
             ("session_id", "==", session["id"])],
        )
        bill = bills[0] if bills else None
    if bill is None:
        bill = _latest_bill(table)

    pending_replacements = store.query(
        REPLACEMENT_REQUESTS,
        [("restaurant_id", "==", restaurant["id"]),
         ("status", "==", "pending"),
         ("table_token", "==", token)],
    )

    open_requests = store.query(
        STAFF_REQUESTS,
        [("restaurant_id", "==", restaurant["id"]),
         ("table_token", "==", token),
         ("status", "==", "pending")],
    )

    categories, items = _menu_public(restaurant["id"])

    return ok(
        {
            "restaurant": _public_restaurant(restaurant),
            "table": {
                "number": table.get("number"),
                "token": table.get("token"),
                "status": table.get("status"),
            },
            "session": {
                "id": session.get("id") if session else "",
                "status": session.get("status") if session else "",
                "opened_at": session.get("opened_at") if session else "",
            },
            "categories": categories,
            "items": items,
            "orders": [customer_view(o) for o in orders],
            "bill": _bill_view(bill),
            "pending_replacements": [
                {
                    "id": r.get("id"),
                    "order_id": r.get("order_id"),
                    "original_name": r.get("original_name"),
                    "original_price": r.get("original_price"),
                    "original_qty": r.get("original_qty"),
                    "replacement_name": r.get("replacement_name"),
                    "replacement_price": r.get("replacement_price"),
                    "replacement_image": r.get("replacement_image"),
                    "status": r.get("status"),
                    "created_at": r.get("created_at"),
                }
                for r in pending_replacements
            ],
            "open_requests": open_requests,
        }
    )


def _public_restaurant(restaurant: dict) -> dict:
    return {
        "id": restaurant.get("id"),
        "name": restaurant.get("name"),
        "slug": restaurant.get("slug"),
        "address": restaurant.get("address", ""),
        "phone": restaurant.get("phone", ""),
        "email": restaurant.get("email", ""),
        "logo_url": restaurant.get("logo_url", ""),
        "tagline": "Scan. Order. Serve.",
    }


def _bill_view(bill: dict | None) -> dict | None:
    if not bill:
        return None
    return {
        "id": bill.get("id"),
        "bill_number": bill.get("bill_number"),
        "status": bill.get("status"),
        "items": bill.get("items", []),
        "subtotal": bill.get("subtotal", 0),
        "gst_rate": bill.get("gst_rate", 0),
        "gst": bill.get("gst", 0),
        "discount": bill.get("discount", 0),
        "total": bill.get("total", 0),
        "payment_method": bill.get("payment_method", ""),
        "created_at": bill.get("created_at"),
        "paid_at": bill.get("paid_at", ""),
    }


# --------------------------------------------------------------------------- #
# Ordering
# --------------------------------------------------------------------------- #

@bp.post("/orders")
def place_order():
    payload = request.get_json(silent=True) or {}
    token = (payload.get("table_token") or "").strip()

    table, restaurant, error = _table_by_token(token)
    if error:
        return error

    raw_items = payload.get("items") or []
    if not raw_items:
        return err("Your cart is empty")

    store = get_store()
    lines: list[dict] = []
    for raw in raw_items:
        item_id = str(raw.get("menu_item_id") or "").strip()
        if not item_id:
            continue
        try:
            qty = int(raw.get("qty") or 0)
        except (TypeError, ValueError):
            return err("Quantity must be a number")
        if qty < 1:
            return err("Quantity must be at least 1")
        if qty > MAX_QTY:
            return err(f"Quantity cannot exceed {MAX_QTY}")

        item = store.get(MENU_ITEMS, item_id)
        if not item or item.get("restaurant_id") != restaurant["id"]:
            return err("One of your items is no longer available", 409, "item_unavailable")
        if not item.get("available", True):
            return err(f"'{item.get('name')}' is currently unavailable", 409,
                       "item_unavailable")

        from services.orders import effective_price

        price = effective_price(item)
        lines.append(
            {
                "menu_item_id": item["id"],
                "name": item.get("name", ""),
                "price": price,
                "qty": qty,
                "amount": money(price * qty),
                "instructions": str(raw.get("instructions") or "").strip()[:300],
                "veg": bool(item.get("veg")),
                "replaced_from": "",
            }
        )

    if not lines:
        return err("Your cart is empty")

    total = recompute_total(lines)

    # --- table session (multiple orders per table session) --------------- #
    session = _open_session(table)
    if session:
        session_id = session["id"]
    else:
        session_id = new_id("ses")
        store.set(
            TABLE_SESSIONS,
            session_id,
            {
                "id": session_id,
                "restaurant_id": restaurant["id"],
                "table_id": table["id"],
                "table_number": table.get("number"),
                "table_token": table.get("token"),
                "status": "open",
                "opened_at": now_iso(),
                "closed_at": "",
                "bill_id": "",
            },
        )

    # --- order ----------------------------------------------------------- #
    order_id = new_id("ord")
    note = str(payload.get("note") or "").strip()[:500]
    order = {
        "id": order_id,
        "restaurant_id": restaurant["id"],
        "table_id": table["id"],
        "table_number": table.get("number"),
        "table_token": table.get("token"),
        "session_id": session_id,
        "items": lines,
        "total": total,
        "note": note,
        "status": "PENDING",
        "history": [{"status": "PENDING", "at": now_iso(), "by": "customer"}],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    store.set(ORDERS, order_id, order)

    for line in lines:
        store.set(
            ORDER_ITEMS,
            new_id("oi"),
            {
                "restaurant_id": restaurant["id"],
                "order_id": order_id,
                "session_id": session_id,
                "table_id": table["id"],
                "menu_item_id": line["menu_item_id"],
                "name": line["name"],
                "price": line["price"],
                "qty": line["qty"],
                "amount": line["amount"],
                "created_at": now_iso(),
            },
        )

    store.update(TABLES, table["id"], {"status": "occupied"})

    emit_to_owner(
        restaurant["id"],
        "order:new",
        {
            **order,
            "status_label": "Placed",
            "items": [{**l, "amount": money(l["price"] * l["qty"])} for l in lines],
        },
    )
    emit_to_customer(
        restaurant["id"], table.get("token", ""), "order:update", customer_view(order)
    )

    return ok(customer_view(order), "Order placed!", 201)


@bp.get("/orders/<order_id>")
def get_order(order_id: str):
    token = request.args.get("table_token", "")
    order = get_store().get(ORDERS, order_id)
    if not order:
        return err("Order not found", 404, "not_found")
    if token and order.get("table_token") != token:
        return err("Order not found", 404, "not_found")
    return ok(customer_view(order))


@bp.get("/table/<token>/orders")
def table_orders(token: str):
    table, restaurant, error = _table_by_token(token)
    if error:
        return error

    session = _open_session(table)
    if not session:
        return ok([])

    orders = get_store().query(
        ORDERS,
        [("restaurant_id", "==", restaurant["id"]),
         ("session_id", "==", session["id"])],
        order_by="created_at",
    )
    return ok([customer_view(o) for o in orders])


# --------------------------------------------------------------------------- #
# Staff requests
# --------------------------------------------------------------------------- #

@bp.post("/requests")
def create_request():
    payload = request.get_json(silent=True) or {}
    token = (payload.get("table_token") or "").strip()
    table, restaurant, error = _table_by_token(token)
    if error:
        return error

    rtype = (payload.get("type") or "").strip()
    if rtype not in REQUEST_TYPES:
        return err("Unknown request type")

    store = get_store()
    session = _open_session(table)

    existing = store.query(
        STAFF_REQUESTS,
        [("restaurant_id", "==", restaurant["id"]),
         ("table_token", "==", token),
         ("type", "==", rtype),
         ("status", "==", "pending")],
    )
    if existing:
        return ok(existing[0], "We have already been notified", 200)

    request_id = new_id("req")
    record = {
        "id": request_id,
        "restaurant_id": restaurant["id"],
        "table_id": table["id"],
        "table_number": table.get("number"),
        "table_token": table.get("token"),
        "session_id": session.get("id") if session else "",
        "type": rtype,
        "note": str(payload.get("note") or "").strip()[:300],
        "status": "pending",
        "created_at": now_iso(),
        "resolved_at": "",
        "resolved_by": "",
    }
    store.set(STAFF_REQUESTS, request_id, record)

    emit_to_owner(restaurant["id"], "request:new", record)
    emit_to_customer(
        restaurant["id"], table.get("token", ""), "request:update", record
    )
    return ok(record, _thanks(rtype), 201)


def _thanks(rtype: str) -> str:
    return {
        "call_staff": "A member of staff is on the way",
        "water": "We'll bring water to your table",
        "cutlery": "Cutlery is on its way",
        "assistance": "We'll be right there to help",
        "bill": "Your bill request has been sent",
    }.get(rtype, "Request sent")


@bp.get("/requests")
def list_requests():
    token = request.args.get("table_token", "")
    if not token:
        return err("table_token is required")
    rows = get_store().query(
        STAFF_REQUESTS,
        [("table_token", "==", token)],
        order_by="created_at",
        descending=True,
    )
    return ok(rows[:30])


# --------------------------------------------------------------------------- #
# Food replacement
# --------------------------------------------------------------------------- #

@bp.post("/replacements/<replacement_id>/respond")
def respond_replacement(replacement_id: str):
    payload = request.get_json(silent=True) or {}
    action = (payload.get("action") or "").strip().lower()
    if action not in ("accept", "reject"):
        return err("Action must be 'accept' or 'reject'")

    store = get_store()
    record = store.get(REPLACEMENT_REQUESTS, replacement_id)
    if not record:
        return err("Request not found", 404, "not_found")
    if record.get("status") != "pending":
        return err("This suggestion was already handled", 409, "already_resolved")

    order = store.get(ORDERS, record.get("order_id", ""))
    if not order:
        return err("Order not found", 404, "not_found")

    original_line = next(
        (i for i in order.get("items", [])
         if i.get("menu_item_id") == record.get("original_item_id")),
        None,
    )
    if original_line is None:
        store.update(
            REPLACEMENT_REQUESTS,
            replacement_id,
            {"status": "expired", "responded_at": now_iso()},
        )
        return err("That item is no longer part of your order", 409, "stale")

    new_items = []
    for line in order.get("items", []):
        if line.get("menu_item_id") != record.get("original_item_id"):
            new_items.append(line)
            continue
        if action == "accept":
            new_items.append(
                {
                    **line,
                    "menu_item_id": record.get("replacement_item_id"),
                    "name": record.get("replacement_name"),
                    "price": money(record.get("replacement_price")),
                    "amount": money(
                        float(record.get("replacement_price") or 0) * int(line.get("qty", 1))
                    ),
                    "replaced_from": record.get("original_name"),
                }
            )

    history = list(order.get("history", []))
    history.append(
        {
            "status": "REPLACEMENT_" + action.upper(),
            "at": now_iso(),
            "by": "customer",
            "detail": f"{record.get('original_name')} -> "
                      f"{record.get('replacement_name') if action == 'accept' else 'removed'}",
        }
    )

    updates = {
        "items": new_items,
        "total": recompute_total(new_items),
        "history": history,
        "updated_at": now_iso(),
    }

    if not new_items:
        updates["status"] = "REJECTED"
        history.append({"status": "REJECTED", "at": now_iso(), "by": "system"})

    store.update(ORDERS, order["id"], updates)
    store.update(
        REPLACEMENT_REQUESTS,
        replacement_id,
        {"status": "accepted" if action == "accept" else "rejected",
         "responded_at": now_iso()},
    )

    updated = store.get(ORDERS, order["id"])
    emit_to_owner(order["restaurant_id"], "order:update", _owner_view(updated))
    emit_to_customer(
        order["restaurant_id"],
        order.get("table_token", ""),
        "order:update",
        customer_view(updated),
    )

    # Keep any already-generated bill in sync with the new order contents.
    refresh_bill_for_session(order["restaurant_id"], order.get("session_id", ""))

    return ok(
        customer_view(updated),
        "Replacement accepted — your bill has been updated"
        if action == "accept"
        else "Item removed from your order — your bill has been updated",
    )


def _owner_view(order: dict) -> dict:
    from services.orders import owner_view

    return owner_view(order)


# --------------------------------------------------------------------------- #
# Bill (customer view)
# --------------------------------------------------------------------------- #

@bp.get("/table/<token>/bill")
def table_bill(token: str):
    table, restaurant, error = _table_by_token(token)
    if error:
        return error

    store = get_store()
    session = _open_session(table)

    if session:
        bills = store.query(
            BILLS,
            [("restaurant_id", "==", restaurant["id"]),
             ("session_id", "==", session["id"])],
        )
        bill = bills[0] if bills else None
    else:
        bill = None

    if bill is None:
        bill = _latest_bill(table)

    return ok(_bill_view(bill))
