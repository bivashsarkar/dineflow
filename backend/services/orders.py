"""Shared order domain logic used by both owner and customer routes."""

from __future__ import annotations

from utils import money, now_iso

# Order lifecycle ----------------------------------------------------------- #
ORDER_STATUSES = (
    "PENDING",
    "ACCEPTED",
    "PREPARING",
    "READY",
    "SERVED",
    "COMPLETED",
)

TRANSITIONS: dict[str, tuple[str, ...]] = {
    "PENDING": ("ACCEPTED", "REJECTED"),
    "ACCEPTED": ("PREPARING",),
    "PREPARING": ("READY",),
    "READY": ("SERVED",),
    "SERVED": ("COMPLETED",),
    "COMPLETED": (),
    "REJECTED": (),
}

STATUS_LABELS = {
    "PENDING": "Placed",
    "ACCEPTED": "Accepted",
    "PREPARING": "Preparing",
    "READY": "Ready",
    "SERVED": "Served",
    "COMPLETED": "Completed",
    "REJECTED": "Rejected",
}

# Orders that are still being prepared — the only ones where a food
# replacement makes sense (nothing has been served yet).
COOKING_STATUSES = ("PENDING", "ACCEPTED", "PREPARING")
# Every order that is neither finished nor rejected.
ACTIVE_ORDER_STATUSES = ("PENDING", "ACCEPTED", "PREPARING", "READY", "SERVED")
# Backwards-friendly alias.
ACTIVE_STATUSES = ACTIVE_ORDER_STATUSES


def can_transition(current: str, new: str) -> bool:
    return new in TRANSITIONS.get(current, ())


def line_amount(price, qty) -> float:
    return money(float(price or 0) * int(qty or 0))


def recompute_total(items: list[dict]) -> float:
    return money(sum(line_amount(i.get("price"), i.get("qty")) for i in items))


def effective_price(item: dict) -> float:
    """Price a customer actually pays (a configured special offer wins)."""
    if item.get("special_offer") and float(item.get("offer_price") or 0) > 0:
        return money(item.get("offer_price"))
    return money(item.get("price"))


def order_history_entry(status: str, by: str) -> dict:
    return {"status": status, "at": now_iso(), "by": by}


def owner_view(order: dict) -> dict:
    """Shape sent to the restaurant owner dashboard."""
    data = dict(order)
    data["status_label"] = STATUS_LABELS.get(order.get("status", ""), order.get("status"))
    data["total"] = money(order.get("total"))
    data["items"] = [
        {
            **i,
            "price": money(i.get("price")),
            "amount": line_amount(i.get("price"), i.get("qty")),
        }
        for i in order.get("items", [])
    ]
    return data


def customer_view(order: dict) -> dict:
    """Shape sent to the customer (never leaks internal restaurant data)."""
    return {
        "id": order.get("id"),
        "restaurant_id": order.get("restaurant_id"),
        "table_number": order.get("table_number"),
        "session_id": order.get("session_id"),
        "status": order.get("status"),
        "status_label": STATUS_LABELS.get(order.get("status", ""), order.get("status")),
        "total": money(order.get("total")),
        "note": order.get("note", ""),
        "items": [
            {
                "menu_item_id": i.get("menu_item_id"),
                "name": i.get("name"),
                "price": money(i.get("price")),
                "qty": i.get("qty"),
                "amount": line_amount(i.get("price"), i.get("qty")),
                "instructions": i.get("instructions", ""),
                "veg": bool(i.get("veg")),
                "replaced_from": i.get("replaced_from", ""),
            }
            for i in order.get("items", [])
        ],
        "history": order.get("history", []),
        "created_at": order.get("created_at"),
        "updated_at": order.get("updated_at"),
    }
