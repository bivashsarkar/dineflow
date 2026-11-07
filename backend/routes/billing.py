"""
Billing — combines every order placed during one table session, applies GST
and discounts, renders a PDF invoice and records manual counter payments.

There is deliberately **no online payment gateway**: customers pay at the
counter and the owner records Cash / UPI / Card manually.
"""

from __future__ import annotations

import io
import secrets

from flask import Blueprint, g, request, send_file

from auth import owner_required
from dbcollections import (
    BILLS,
    ORDERS,
    PAYMENTS,
    RESTAURANTS,
    STAFF_REQUESTS,
    TABLES,
    TABLE_SESSIONS,
)
from realtime import emit_to_customer, emit_to_owner
from services.pdf import build_bill_pdf
from store import get_store
from utils import err, is_today, money, now_iso, ok

bp = Blueprint("owner_billing", __name__, url_prefix="/api/owner")

PAYMENT_METHODS = ("cash", "upi", "card")
GST_RATE_DEFAULT = 5.0


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _session(session_id: str) -> dict | None:
    session = get_store().get(TABLE_SESSIONS, session_id)
    if not session or session.get("restaurant_id") != g.restaurant_id:
        return None
    return session


def _bill(bill_id: str) -> dict | None:
    bill = get_store().get(BILLS, bill_id)
    if not bill or bill.get("restaurant_id") != g.restaurant_id:
        return None
    return bill


def _orders_for_session(session_id: str) -> list[dict]:
    return get_store().query(
        ORDERS,
        [("restaurant_id", "==", g.restaurant_id), ("session_id", "==", session_id)],
        order_by="created_at",
    )


def build_items(orders: list[dict]) -> list[dict]:
    """Merge line items across orders so the same dish appears once."""
    merged: dict[str, dict] = {}
    for order in orders:
        if order.get("status") == "REJECTED":
            continue
        for line in order.get("items", []):
            key = f"{line.get('menu_item_id')}|{line.get('price')}"
            if key in merged:
                merged[key]["qty"] += int(line.get("qty", 1))
                merged[key]["amount"] = money(
                    merged[key]["qty"] * float(merged[key]["price"])
                )
            else:
                qty = int(line.get("qty", 1))
                price = money(line.get("price"))
                merged[key] = {
                    "menu_item_id": line.get("menu_item_id"),
                    "name": line.get("name"),
                    "price": price,
                    "qty": qty,
                    "amount": money(qty * price),
                    "veg": bool(line.get("veg")),
                }
    return list(merged.values())


def compute_totals(
    items: list[dict],
    gst_rate: float = GST_RATE_DEFAULT,
    discount_type: str = "flat",
    discount_value: float = 0,
) -> dict:
    subtotal = money(sum(float(i.get("amount", 0) or 0) for i in items))
    gst_rate = float(gst_rate or 0)
    gst = money(subtotal * gst_rate / 100.0)

    discount_value = float(discount_value or 0)
    if discount_type == "percent":
        discount = money(min(subtotal, subtotal * discount_value / 100.0))
    else:
        discount = money(min(subtotal, discount_value))

    total = money(max(0, subtotal + gst - discount))
    return {
        "subtotal": subtotal,
        "gst_rate": gst_rate,
        "gst": gst,
        "discount": discount,
        "discount_type": discount_type,
        "discount_value": discount_value,
        "total": total,
    }


def _new_bill_number() -> str:
    return f"DF{now_iso()[2:10].replace('-', '')}-{secrets.token_hex(2).upper()}"


def _serialize(bill: dict) -> dict:
    return bill


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #

@bp.get("/bills")
@owner_required
def list_bills():
    store = get_store()
    scope = [("restaurant_id", "==", g.restaurant_id)]
    status = request.args.get("status", "")
    if status:
        scope.append(("status", "==", status))

    bills = store.query(BILLS, scope, order_by="created_at", descending=True)
    return ok([_serialize(b) for b in bills])


@bp.get("/bills/<bill_id>")
@owner_required
def get_bill(bill_id: str):
    bill = _bill(bill_id)
    if not bill:
        return err("Bill not found", 404, "not_found")
    session = get_store().get(TABLE_SESSIONS, bill.get("session_id", ""))
    return ok({**bill, "table_number": bill.get("table_number") or (session or {}).get("table_number")})


@bp.get("/sessions/<session_id>/bill")
@owner_required
def session_bill(session_id: str):
    """Return the stored bill, or a live preview if none has been created yet."""
    session = _session(session_id)
    if not session:
        return err("Table session not found", 404, "not_found")

    store = get_store()
    existing = store.query(
        BILLS,
        [("restaurant_id", "==", g.restaurant_id), ("session_id", "==", session_id)],
    )
    if existing:
        return ok({"bill": existing[0], "preview": False})

    orders = _orders_for_session(session_id)
    items = build_items(orders)
    totals = compute_totals(items, GST_RATE_DEFAULT)
    return ok(
        {
            "bill": {
                "id": "",
                "session_id": session_id,
                "table_number": session.get("table_number"),
                "table_id": session.get("table_id"),
                "status": "draft",
                "items": items,
                "order_ids": [o["id"] for o in orders],
                **totals,
            },
            "preview": True,
        }
    )


@bp.post("/sessions/<session_id>/bill")
@owner_required
def generate_bill(session_id: str):
    session = _session(session_id)
    if not session:
        return err("Table session not found", 404, "not_found")

    store = get_store()
    existing = store.query(
        BILLS,
        [("restaurant_id", "==", g.restaurant_id), ("session_id", "==", session_id)],
    )
    if existing:
        return ok({"bill": existing[0], "preview": False}, "Bill already generated")

    orders = _orders_for_session(session_id)
    items = build_items(orders)
    if not items:
        return err("No billable orders in this session yet", 409, "empty_session")

    payload = request.get_json(silent=True) or {}
    gst_rate = float(payload.get("gst_rate", GST_RATE_DEFAULT) or 0)
    totals = compute_totals(
        items,
        gst_rate,
        payload.get("discount_type", "flat"),
        payload.get("discount_value", 0),
    )

    bill_id = new_bill_id()
    bill = {
        "id": bill_id,
        "restaurant_id": g.restaurant_id,
        "session_id": session_id,
        "table_id": session.get("table_id"),
        "table_number": session.get("table_number"),
        "table_token": session.get("table_token", ""),
        "bill_number": _new_bill_number(),
        "items": items,
        "order_ids": [o["id"] for o in orders],
        "status": "unpaid",
        "payment_method": "",
        "notes": (payload.get("notes") or "").strip(),
        "created_by": g.username,
        "created_at": now_iso(),
        "paid_at": "",
        **totals,
    }
    store.set(BILLS, bill_id, bill)
    store.update(TABLE_SESSIONS, session_id, {"status": "billed", "bill_id": bill_id})

    emit_to_owner(g.restaurant_id, "bill:updated", bill)
    emit_to_customer(
        g.restaurant_id,
        session.get("table_token", ""),
        "bill:updated",
        _customer_bill(bill),
    )
    return ok({"bill": bill, "preview": False}, "Bill generated", 201)


@bp.put("/bills/<bill_id>")
@owner_required
def update_bill(bill_id: str):
    bill = _bill(bill_id)
    if not bill:
        return err("Bill not found", 404, "not_found")
    if bill.get("status") == "paid":
        return err("A paid bill cannot be edited", 409, "bill_paid")

    payload = request.get_json(silent=True) or {}
    gst_rate = float(payload.get("gst_rate", bill.get("gst_rate", GST_RATE_DEFAULT)) or 0)
    if gst_rate < 0 or gst_rate > 100:
        return err("GST rate must be between 0 and 100")

    discount_type = payload.get("discount_type", bill.get("discount_type", "flat"))
    if discount_type not in ("flat", "percent"):
        return err("Discount type must be 'flat' or 'percent'")
    discount_value = float(payload.get("discount_value", bill.get("discount_value", 0)) or 0)
    if discount_value < 0:
        return err("Discount cannot be negative")

    totals = compute_totals(
        bill.get("items", []), gst_rate, discount_type, discount_value
    )
    notes = payload.get("notes", bill.get("notes", ""))
    updates = {**totals, "notes": (notes or "").strip(), "updated_at": now_iso()}

    store = get_store()
    store.update(BILLS, bill_id, updates)
    updated = store.get(BILLS, bill_id)

    emit_to_owner(g.restaurant_id, "bill:updated", updated)
    emit_to_customer(
        g.restaurant_id,
        updated.get("table_token", ""),
        "bill:updated",
        _customer_bill(updated),
    )
    return ok(updated, "Bill updated")


@bp.delete("/bills/<bill_id>")
@owner_required
def delete_bill(bill_id: str):
    """Void an unpaid bill so the table session can be re-billed."""
    bill = _bill(bill_id)
    if not bill:
        return err("Bill not found", 404, "not_found")
    if bill.get("status") == "paid":
        return err("A paid bill cannot be voided", 409, "bill_paid")

    store = get_store()
    store.delete(BILLS, bill_id)
    if bill.get("session_id"):
        store.update(TABLE_SESSIONS, bill["session_id"], {"status": "open", "bill_id": ""})
    emit_to_owner(g.restaurant_id, "bill:updated", {"id": bill_id, "status": "void"})
    return ok(message="Bill voided")


@bp.post("/bills/<bill_id>/pay")
@owner_required
def pay_bill(bill_id: str):
    """Manual pay-at-counter flow: the owner records the physical payment."""
    bill = _bill(bill_id)
    if not bill:
        return err("Bill not found", 404, "not_found")
    if bill.get("status") == "paid":
        return err("This bill is already paid", 409, "already_paid")

    payload = request.get_json(silent=True) or {}
    method = (payload.get("method") or "").strip().lower()
    if method not in PAYMENT_METHODS:
        return err("Choose a payment method: cash, upi or card")

    store = get_store()
    paid_at = now_iso()
    updates = {
        "status": "paid",
        "payment_method": method,
        "paid_at": paid_at,
        "paid_by": g.username,
    }
    store.update(BILLS, bill_id, updates)
    updated = store.get(BILLS, bill_id)

    payment_id = new_payment_id()
    store.set(
        PAYMENTS,
        payment_id,
        {
            "id": payment_id,
            "restaurant_id": g.restaurant_id,
            "bill_id": bill_id,
            "session_id": bill.get("session_id", ""),
            "table_number": bill.get("table_number"),
            "amount": bill.get("total"),
            "method": method,
            "recorded_by": g.username,
            "recorded_at": paid_at,
        },
    )

    session_id = bill.get("session_id", "")
    if session_id:
        store.update(
            TABLE_SESSIONS,
            session_id,
            {"status": "closed", "closed_at": paid_at},
        )
    if bill.get("table_id"):
        store.update(TABLES, bill["table_id"], {"status": "available"})

    # The bill request that started this is now satisfied.
    for req in store.query(
        STAFF_REQUESTS,
        [("restaurant_id", "==", g.restaurant_id),
         ("session_id", "==", session_id),
         ("type", "==", "bill"),
         ("status", "==", "pending")],
    ):
        store.update(
            STAFF_REQUESTS,
            req["id"],
            {"status": "resolved", "resolved_at": paid_at,
             "resolved_by": f"owner:{g.username}"},
        )

    emit_to_owner(g.restaurant_id, "bill:paid", updated)
    emit_to_customer(
        g.restaurant_id,
        bill.get("table_token", ""),
        "bill:paid",
        _customer_bill(updated),
    )
    emit_to_owner(g.restaurant_id, "tables:changed", {})
    return ok(updated, f"Payment of Rs {updated.get('total')} recorded via {method.upper()}")


@bp.get("/bills/<bill_id>/pdf")
@owner_required
def bill_pdf(bill_id: str):
    bill = _bill(bill_id)
    if not bill:
        return err("Bill not found", 404, "not_found")

    store = get_store()
    restaurant = store.get(RESTAURANTS, g.restaurant_id) or {}
    table_number = bill.get("table_number")
    if table_number is None and bill.get("table_id"):
        table = store.get(TABLES, bill["table_id"]) or {}
        table_number = table.get("number")

    raw = build_bill_pdf(bill, restaurant, table_number)
    filename = f"{bill.get('bill_number', 'bill')}.pdf"
    return send_file(
        io.BytesIO(raw),
        mimetype="application/pdf",
        as_attachment=True,
        download_name=filename,
    )


def refresh_bill_for_session(restaurant_id: str, session_id: str) -> None:
    """
    Recompute an unpaid bill after the underlying orders changed
    (food replacement accepted / rejected by the customer).
    """
    if not session_id:
        return

    store = get_store()
    bills = store.query(
        BILLS,
        [("restaurant_id", "==", restaurant_id), ("session_id", "==", session_id)],
    )
    if not bills:
        return

    bill = bills[0]
    if bill.get("status") == "paid":
        return

    orders = store.query(
        ORDERS,
        [("restaurant_id", "==", restaurant_id), ("session_id", "==", session_id)],
        order_by="created_at",
    )
    items = build_items(orders)

    if not items:
        store.delete(BILLS, bill["id"])
        store.update(TABLE_SESSIONS, session_id, {"status": "open", "bill_id": ""})
        emit_to_owner(restaurant_id, "bill:updated", {"id": bill["id"], "status": "void"})
        return

    totals = compute_totals(
        items,
        bill.get("gst_rate", GST_RATE_DEFAULT),
        bill.get("discount_type", "flat"),
        bill.get("discount_value", 0),
    )
    store.update(
        BILLS,
        bill["id"],
        {
            "items": items,
            "order_ids": [o["id"] for o in orders],
            "updated_at": now_iso(),
            **totals,
        },
    )
    updated = store.get(BILLS, bill["id"])
    emit_to_owner(restaurant_id, "bill:updated", updated)
    emit_to_customer(
        restaurant_id,
        updated.get("table_token", ""),
        "bill:updated",
        _customer_bill(updated),
    )


def _customer_bill(bill: dict) -> dict:
    return {
        "id": bill.get("id"),
        "bill_number": bill.get("bill_number"),
        "table_number": bill.get("table_number"),
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


def new_bill_id() -> str:
    from utils import new_id

    return new_id("bil")


def new_payment_id() -> str:
    from utils import new_id

    return new_id("pay")
