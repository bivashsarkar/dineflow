"""
Table management and QR code generation.

Every table carries an opaque ``token``. The QR code encodes
``/r/<slug>/table/<token>`` so the same table number in two different
restaurants always produces a completely different code.
"""

from __future__ import annotations

from flask import Blueprint, g, request, send_file
import io

from auth import owner_required
from dbcollections import ORDERS, RESTAURANTS, TABLES, TABLE_SESSIONS
from realtime import emit_to_owner
from services import qr as qr_service
from store import get_store
from utils import err, new_id, new_token, now_iso, ok

bp = Blueprint("owner_tables", __name__, url_prefix="/api/owner")

TABLE_STATUS = ("available", "occupied")


def _scope() -> list[tuple]:
    return [("restaurant_id", "==", g.restaurant_id)]


def _table(table_id: str) -> dict | None:
    table = get_store().get(TABLES, table_id)
    if not table or table.get("restaurant_id") != g.restaurant_id:
        return None
    return table


def _serialize(table: dict, restaurant: dict | None = None) -> dict:
    slug = (restaurant or {}).get("slug", "")
    target = qr_service.table_url(slug, table.get("token", ""))
    return {
        "id": table.get("id"),
        "restaurant_id": table.get("restaurant_id"),
        "number": table.get("number"),
        "token": table.get("token"),
        "status": table.get("status", "available"),
        "created_at": table.get("created_at"),
        "qr_url": target,
        "qr_image": f"/qr/{table.get('qr_file', '')}" if table.get("qr_file") else "",
        "menu_url": f"/r/{slug}/table/{table.get('token', '')}",
    }


def _restaurant() -> dict | None:
    return get_store().get(RESTAURANTS, g.restaurant_id)


def _ensure_qr(table: dict, restaurant: dict) -> dict:
    """Generate the PNG once and reuse it for download / print."""
    if table.get("qr_file"):
        return table
    target = qr_service.table_url(restaurant.get("slug", ""), table.get("token", ""))
    filename = f"{restaurant.get('slug', 'restaurant')}-table-{table.get('number')}"
    path = qr_service.qr_png_bytes(target)
    url = qr_service.save_qr(target, filename)
    updates = {"qr_file": url.split("/")[-1], "qr_url": target}
    get_store().update(TABLES, table["id"], updates)
    table.update(updates)
    return table


# --------------------------------------------------------------------------- #

@bp.get("/tables")
@owner_required
def list_tables():
    store = get_store()
    restaurant = _restaurant()
    rows = store.query(TABLES, _scope(), order_by="number")

    sessions = {
        s.get("table_id"): s
        for s in store.query(
            TABLE_SESSIONS,
            [("restaurant_id", "==", g.restaurant_id), ("status", "==", "open")],
        )
    }

    data = []
    for table in rows:
        if not table.get("qr_file"):
            table = _ensure_qr(table, restaurant)
        row = _serialize(table, restaurant)
        session = sessions.get(table["id"])
        row["session_id"] = session.get("id") if session else ""
        row["open_orders"] = 0
        if session:
            row["open_orders"] = store.count(
                ORDERS,
                [("restaurant_id", "==", g.restaurant_id),
                 ("session_id", "==", session["id"])],
            )
        data.append(row)
    return ok(data)


@bp.post("/tables")
@owner_required
def create_table():
    payload = request.get_json(silent=True) or {}
    store = get_store()
    restaurant = _restaurant()
    if not restaurant:
        return err("Restaurant not found", 404, "not_found")

    existing = store.query(TABLES, _scope())
    raw_number = payload.get("number")
    if raw_number in (None, ""):
        # Auto-increment when the owner does not supply a number.
        numbers = [int(t.get("number") or 0) for t in existing]
        number = (max(numbers) + 1) if numbers else 1
    else:
        try:
            number = int(raw_number)
        except (TypeError, ValueError):
            return err("Table number must be a number")
        if number <= 0:
            return err("Table number must be greater than zero")

    if any(int(t.get("number") or 0) == number for t in existing):
        return err(f"Table {number} already exists", 409, "duplicate")

    table_id = new_id("tbl")
    token = new_token("tbl")
    table = {
        "id": table_id,
        "restaurant_id": g.restaurant_id,
        "number": number,
        "token": token,
        "status": "available",
        "qr_file": "",
        "created_at": now_iso(),
    }
    store.set(TABLES, table_id, table)
    table = _ensure_qr(table, restaurant)
    emit_to_owner(g.restaurant_id, "tables:changed", {})
    return ok(_serialize(table, restaurant), "Table added", 201)


@bp.put("/tables/<table_id>")
@owner_required
def update_table(table_id: str):
    table = _table(table_id)
    if not table:
        return err("Table not found", 404, "not_found")

    payload = request.get_json(silent=True) or {}
    if "number" not in payload:
        return err("Nothing to update")

    try:
        number = int(payload.get("number"))
    except (TypeError, ValueError):
        return err("Table number must be a number")

    store = get_store()
    if number <= 0:
        return err("Table number must be greater than zero")
    if any(
        int(t.get("number") or 0) == number and t["id"] != table_id
        for t in store.query(TABLES, _scope())
    ):
        return err(f"Table {number} already exists", 409, "duplicate")

    restaurant = _restaurant()
    # Renumbering invalidates the printed QR file name, so force a regeneration.
    store.update(TABLES, table_id, {"number": number, "qr_file": ""})
    fresh = _ensure_qr(store.get(TABLES, table_id), restaurant or {})
    emit_to_owner(g.restaurant_id, "tables:changed", {})
    return ok(_serialize(fresh, restaurant), "Table updated")


@bp.delete("/tables/<table_id>")
@owner_required
def delete_table(table_id: str):
    table = _table(table_id)
    if not table:
        return err("Table not found", 404, "not_found")

    store = get_store()
    open_session = store.query(
        TABLE_SESSIONS,
        [("restaurant_id", "==", g.restaurant_id),
         ("table_id", "==", table_id),
         ("status", "==", "open")],
    )
    if open_session:
        return err(
            "This table has an open bill session. Settle it before deleting the table.",
            409,
            "table_in_use",
        )

    store.delete(TABLES, table_id)
    emit_to_owner(g.restaurant_id, "tables:changed", {})
    return ok(message="Table deleted")


@bp.get("/tables/<table_id>/qr")
@owner_required
def table_qr(table_id: str):
    table = _table(table_id)
    if not table:
        return err("Table not found", 404, "not_found")
    restaurant = _restaurant()
    table = _ensure_qr(table, restaurant or {})
    target = qr_service.table_url((restaurant or {}).get("slug", ""), table.get("token", ""))
    return ok(
        {
            **_serialize(table, restaurant),
            "qr_data_url": qr_service.qr_data_url(target),
            "download_url": f"/api/owner/tables/{table_id}/qr/download",
        }
    )


@bp.get("/tables/<table_id>/qr/download")
@owner_required
def table_qr_download(table_id: str):
    table = _table(table_id)
    if not table:
        return err("Table not found", 404, "not_found")

    restaurant = _restaurant() or {}
    table = _ensure_qr(table, restaurant)
    target = qr_service.table_url(restaurant.get("slug", ""), table.get("token", ""))
    raw = qr_service.qr_png_bytes(target)
    filename = f"{restaurant.get('slug', 'restaurant')}-table-{table.get('number')}.png"
    return send_file(
        io.BytesIO(raw),
        mimetype="image/png",
        as_attachment=True,
        download_name=filename,
    )


@bp.get("/tables/<table_id>/qr/print")
@owner_required
def table_qr_print(table_id: str):
    """Self-contained printable HTML (works with the browser's print dialog)."""
    table = _table(table_id)
    if not table:
        return err("Table not found", 404, "not_found")

    restaurant = _restaurant() or {}
    table = _ensure_qr(table, restaurant)
    target = qr_service.table_url(restaurant.get("slug", ""), table.get("token", ""))
    data_url = qr_service.qr_data_url(target)

    from flask import Response

    html = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Table {table.get('number')} — {restaurant.get('name','')}</title>
<style>
  body{{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#FBF7EF;
        display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}}
  .card{{background:#fff;border:1px solid #EDE3CF;border-radius:24px;padding:34px 30px;
        width:320px;text-align:center;box-shadow:0 18px 40px -24px rgba(34,30,26,.4)}}
  h1{{font-size:15px;letter-spacing:.14em;text-transform:uppercase;margin:0 0 4px;color:#221E1A}}
  .table{{font-size:52px;font-weight:800;color:#F96A16;line-height:1;margin:10px 0 16px}}
  img{{width:210px;height:210px}}
  .hint{{font-size:13px;color:#6B6257;margin-top:14px}}
  .brand{{font-size:11px;color:#6B6257;margin-top:16px;letter-spacing:.08em}}
  @media print{{body{{background:#fff}}.card{{box-shadow:none}}}}
</style></head>
<body><div class="card">
  <h1>{restaurant.get('name','Restaurant')}</h1>
  <div class="table">Table {table.get('number')}</div>
  <img src="{data_url}" alt="Scan to order" />
  <div class="hint">Scan with your phone to browse the menu &amp; order</div>
  <div class="brand">DineFlow · Scan. Order. Serve.</div>
</div></body></html>"""
    return Response(html, mimetype="text/html")
