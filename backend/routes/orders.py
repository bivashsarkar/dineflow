"""
Restaurant owner order management, customer staff requests, replacement
proposals and live table sessions.
"""

from __future__ import annotations

from flask import Blueprint, g, request

from auth import owner_required
from dbcollections import (
    ORDERS,
    REPLACEMENT_REQUESTS,
    STAFF_REQUESTS,
    TABLE_SESSIONS,
)
from realtime import emit_to_customer, emit_to_owner
from services.orders import (
    ORDER_STATUSES,
    STATUS_LABELS,
    can_transition,
    owner_view,
)
from store import get_store
from utils import err, money, now_iso, ok

bp = Blueprint("owner_orders", __name__, url_prefix="/api/owner")

REQUEST_TYPES = ("call_staff", "water", "cutlery", "assistance", "bill")


def _order(order_id: str) -> dict | None:
    order = get_store().get(ORDERS, order_id)
    if not order or order.get("restaurant_id") != g.restaurant_id:
        return None
    return order


def _push_order(order: dict, actor: str) -> None:
    view = owner_view(order)
    emit_to_owner(g.restaurant_id, "order:update", view)
    emit_to_customer(
        g.restaurant_id,
        order.get("table_token", ""),
        "order:update",
        view,
    )


# --------------------------------------------------------------------------- #
# Orders
# --------------------------------------------------------------------------- #

@bp.get("/orders")
@owner_required
def list_orders():
    store = get_store()
    status = request.args.get("status", "").strip()
    scope = [("restaurant_id", "==", g.restaurant_id)]
    if status and status != "ALL":
        scope.append(("status", "==", status))

    orders = store.query(ORDERS, scope, order_by="created_at", descending=True)

    if request.args.get("today") in ("1", "true", "yes"):
        orders = [o for o in orders if str(o.get("created_at", ""))[:10] == _today()]

    table_id = request.args.get("table_id", "")
    if table_id:
        orders = [o for o in orders if o.get("table_id") == table_id]

    limit = request.args.get("limit")
    if limit:
        try:
            orders = orders[: int(limit)]
        except ValueError:
            pass

    return ok([owner_view(o) for o in orders])


def _today() -> str:
    from utils import today_key

    return today_key()


@bp.get("/orders/<order_id>")
@owner_required
def get_order(order_id: str):
    order = _order(order_id)
    if not order:
        return err("Order not found", 404, "not_found")
    return ok(owner_view(order))


@bp.patch("/orders/<order_id>/status")
@owner_required
def update_status(order_id: str):
    order = _order(order_id)
    if not order:
        return err("Order not found", 404, "not_found")

    payload = request.get_json(silent=True) or {}
    new_status = (payload.get("status") or "").strip().upper()
    if new_status not in ORDER_STATUSES and new_status != "REJECTED":
        return err("Unknown order status")

    current = order.get("status")
    if not can_transition(current, new_status):
        return err(
            f"Cannot move an order from {current} to {new_status}",
            409,
            "invalid_transition",
        )

    store = get_store()
    history = list(order.get("history", []))
    history.append(
        {"status": new_status, "at": now_iso(), "by": f"owner:{g.username}"}
    )
    updates = {
        "status": new_status,
        "updated_at": now_iso(),
        "history": history,
    }
    store.update(ORDERS, order_id, updates)

    updated = store.get(ORDERS, order_id)
    _push_order(updated, "owner")

    if new_status == "REJECTED":
        emit_to_owner(
            g.restaurant_id,
            "order:rejected",
            {"order_id": order_id, "table_number": order.get("table_number")},
        )

    return ok(
        owner_view(updated),
        f"Order marked {STATUS_LABELS.get(new_status, new_status).lower()}",
    )


# --------------------------------------------------------------------------- #
# Staff requests
# --------------------------------------------------------------------------- #

@bp.get("/requests")
@owner_required
def list_requests():
    store = get_store()
    scope = [("restaurant_id", "==", g.restaurant_id)]
    status = request.args.get("status", "")
    if status:
        scope.append(("status", "==", status))

    rows = store.query(STAFF_REQUESTS, scope, order_by="created_at", descending=True)
    if request.args.get("limit"):
        try:
            rows = rows[: int(request.args.get("limit"))]
        except ValueError:
            pass
    return ok(rows)


@bp.patch("/requests/<request_id>/resolve")
@owner_required
def resolve_request(request_id: str):
    store = get_store()
    record = store.get(STAFF_REQUESTS, request_id)
    if not record or record.get("restaurant_id") != g.restaurant_id:
        return err("Request not found", 404, "not_found")
    if record.get("status") == "resolved":
        return err("This request is already resolved", 409, "already_resolved")

    payload = request.get_json(silent=True) or {}
    resolved_by = payload.get("resolved_by") or f"owner:{g.username}"
    store.update(
        STAFF_REQUESTS,
        request_id,
        {"status": "resolved", "resolved_at": now_iso(), "resolved_by": resolved_by},
    )

    emit_to_owner(g.restaurant_id, "request:update", {**record, "status": "resolved"})
    emit_to_customer(
        g.restaurant_id,
        record.get("table_token", ""),
        "request:update",
        {**record, "status": "resolved"},
    )
    return ok(message="Request marked as resolved")


# --------------------------------------------------------------------------- #
# Replacement proposals (owner side)
# --------------------------------------------------------------------------- #

@bp.get("/replacements")
@owner_required
def list_replacements():
    rows = get_store().query(
        REPLACEMENT_REQUESTS,
        [("restaurant_id", "==", g.restaurant_id)],
        order_by="created_at",
        descending=True,
    )
    return ok(rows)


# --------------------------------------------------------------------------- #
# Live table sessions
# --------------------------------------------------------------------------- #

@bp.get("/sessions")
@owner_required
def list_sessions():
    store = get_store()
    sessions = store.query(
        TABLE_SESSIONS,
        [("restaurant_id", "==", g.restaurant_id)],
        order_by="opened_at",
        descending=True,
    )

    data = []
    for session in sessions:
        orders = store.query(
            ORDERS,
            [("restaurant_id", "==", g.restaurant_id),
             ("session_id", "==", session["id"])],
        )
        bills = store.query(
            "bills",
            [("restaurant_id", "==", g.restaurant_id),
             ("session_id", "==", session["id"])],
        )
        bill = bills[0] if bills else None
        open_orders = [o for o in orders if o.get("status") not in ("COMPLETED", "REJECTED")]
        data.append(
            {
                "id": session.get("id"),
                "table_id": session.get("table_id"),
                "table_number": session.get("table_number"),
                "table_token": session.get("table_token"),
                "status": session.get("status"),
                "opened_at": session.get("opened_at"),
                "closed_at": session.get("closed_at", ""),
                "order_count": len(orders),
                "open_order_count": len(open_orders),
                "total": money(sum(float(o.get("total", 0) or 0) for o in orders
                                   if o.get("status") != "REJECTED")),
                "bill_id": bill.get("id") if bill else "",
                "bill_status": bill.get("status") if bill else "",
                "bill_total": money(bill.get("total")) if bill else 0,
                "bill_requested": any(
                    r.get("type") == "bill" and r.get("status") == "pending"
                    for r in store.query(
                        STAFF_REQUESTS,
                        [("restaurant_id", "==", g.restaurant_id),
                         ("session_id", "==", session["id"]),
                         ("status", "==", "pending")],
                    )
                ),
                "orders": [owner_view(o) for o in sorted(
                    orders, key=lambda x: x.get("created_at", ""))],
            }
        )
    return ok(data)
