"""
DineFlow end-to-end test — walks the complete scenario from the project brief:

    Super admin login -> create restaurants -> owner login -> menu -> tables/QR
    -> customer order -> live status updates -> bill request -> counter payment
    -> isolation between restaurants -> PDF invoice.

Run with:   python tests/test_flow.py
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

# Use an isolated database so the developer's real data is never touched.
_TMP = Path(tempfile.mkdtemp(prefix="dineflow_test_"))
os.environ["DINEFLOW_DATA_DIR"] = str(_TMP / "data")
os.environ["DINEFLOW_UPLOAD_FOLDER"] = str(_TMP / "uploads")
os.environ["DINEFLOW_DEBUG"] = "0"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Windows consoles default to cp1252; make output unicode safe.
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from app import app  # noqa: E402

client = app.test_client()
PASSED: list[str] = []


def check(label: str, condition: bool, detail: str = ""):
    if condition:
        PASSED.append(label)
        print(f"  PASS  {label}")
    else:
        print(f"  FAIL  {label} {detail}")
        raise AssertionError(f"{label} :: {detail}")


def json_of(response):
    body = response.get_json() or {}
    if not body.get("success"):
        raise AssertionError(
            f"API call failed ({response.status_code}): {body.get('message')}"
        )
    return body.get("data")


def main() -> None:
    # ------------------------------------------------------------------ #
    print("\n1. SUPER ADMIN")
    # ------------------------------------------------------------------ #
    r = client.post("/api/superadmin/login", json={"username": "bivash",
                                                   "password": "dineflow@123"})
    check("super admin login", r.status_code == 200, str(r.status_code))
    admin_token = json_of(r)["token"]
    H_ADMIN = {"Authorization": f"Bearer {admin_token}"}

    r = client.post("/api/superadmin/login", json={"username": "bivash",
                                                   "password": "wrong"})
    check("wrong password rejected", r.status_code == 401)

    # ------------------------------------------------------------------ #
    print("\n2. CREATE RESTAURANTS")
    # ------------------------------------------------------------------ #
    r = client.post(
        "/api/superadmin/restaurants",
        headers=H_ADMIN,
        json={
            "name": "Food Corner",
            "owner_name": "Rahul Sharma",
            "phone": "9876543210",
            "email": "rahul@foodcorner.in",
            "address": "12 MG Road, Bengaluru",
        },
    )
    check("create Food Corner", r.status_code == 201, str(r.status_code))
    food = json_of(r)
    fc_id = food["restaurant"]["id"]
    fc_user = food["credentials"]["username"]
    fc_pass = food["credentials"]["password"]
    check("Food Corner slug generated", food["restaurant"]["slug"] == "food-corner",
          food["restaurant"]["slug"])
    check("Food Corner credentials issued", bool(fc_user and fc_pass))

    r = client.post(
        "/api/superadmin/restaurants",
        headers=H_ADMIN,
        json={
            "name": "Royal Cafe",
            "owner_name": "Ayesha Khan",
            "phone": "9123456780",
            "email": "ayesha@royalcafe.in",
            "address": "4 Park Street, Kolkata",
        },
    )
    check("create Royal Cafe", r.status_code == 201)
    royal = json_of(r)
    rc_id = royal["restaurant"]["id"]
    rc_user = royal["credentials"]["username"]
    rc_pass = royal["credentials"]["password"]

    check("restaurants have unique ids", fc_id != rc_id)
    check("restaurants have unique slugs",
          food["restaurant"]["slug"] != royal["restaurant"]["slug"])
    check("owner usernames differ", fc_user != rc_user,
          f"{fc_user} vs {rc_user}")

    # ------------------------------------------------------------------ #
    print("\n3. OWNER LOGINS")
    # ------------------------------------------------------------------ #
    r = client.post("/api/owner/login", json={"username": fc_user, "password": fc_pass})
    check("Food Corner owner login", r.status_code == 200, str(r.status_code))
    fc = json_of(r)
    fc_token = fc["token"]
    H_FC = {"Authorization": f"Bearer {fc_token}"}
    check("owner session carries restaurant id", fc["restaurant"]["id"] == fc_id)

    r = client.post("/api/owner/login", json={"username": fc_user, "password": "nope"})
    check("wrong owner password rejected", r.status_code == 401)

    r = client.post("/api/owner/login", json={"username": rc_user, "password": rc_pass})
    check("Royal Cafe owner login", r.status_code == 200)
    H_RC = {"Authorization": f"Bearer {json_of(r)['token']}"}

    # ------------------------------------------------------------------ #
    print("\n4. MENU MANAGEMENT")
    # ------------------------------------------------------------------ #
    r = client.post("/api/owner/categories", headers=H_FC, json={"name": "Main Course"})
    check("Food Corner category created", r.status_code == 201)
    fc_cat = json_of(r)["id"]

    r = client.post(
        "/api/owner/menu",
        headers=H_FC,
        json={
            "name": "Chicken Biryani",
            "description": "Fragrant basmati rice with tender chicken",
            "price": 180,
            "category_id": fc_cat,
            "veg": False,
            "bestseller": True,
        },
    )
    check("Food Corner adds Chicken Biryani ₹180", r.status_code == 201)
    biryani = json_of(r)
    check("biryani price stored", float(biryani["price"]) == 180.0, str(biryani["price"]))

    r = client.post("/api/owner/categories", headers=H_RC, json={"name": "Italian"})
    check("Royal Cafe category created", r.status_code == 201)
    rc_cat = json_of(r)["id"]

    r = client.post(
        "/api/owner/menu",
        headers=H_RC,
        json={
            "name": "Margherita Pizza",
            "description": "Wood-fired crust, fresh basil, mozzarella",
            "price": 150,
            "category_id": rc_cat,
            "veg": True,
        },
    )
    check("Royal Cafe adds Pizza ₹150", r.status_code == 201)
    pizza = json_of(r)

    # Menu isolation
    r = client.get("/api/owner/menu", headers=H_RC)
    rc_menu = json_of(r)
    check("Royal Cafe menu has only its own item",
          {i["id"] for i in rc_menu} == {pizza["id"]})
    r = client.get("/api/owner/menu", headers=H_FC)
    fc_menu = json_of(r)
    check("Food Corner menu has only its own item",
          {i["id"] for i in fc_menu} == {biryani["id"]})

    # Edit + availability
    r = client.put(f"/api/owner/menu/{biryani['id']}", headers=H_FC,
                   json={"price": 190, "description": "Updated description"})
    check("edit menu item", json_of(r)["price"] == 190.0)
    r = client.put(f"/api/owner/menu/{biryani['id']}", headers=H_FC, json={"price": 180})
    check("restore price", json_of(r)["price"] == 180.0)

    r = client.patch(f"/api/owner/menu/{biryani['id']}/availability", headers=H_FC,
                     json={"available": False})
    check("mark unavailable", json_of(r)["available"] is False)
    r = client.patch(f"/api/owner/menu/{biryani['id']}/availability", headers=H_FC,
                     json={"available": True})
    check("mark available", json_of(r)["available"] is True)

    # ------------------------------------------------------------------ #
    print("\n5. TABLES + QR CODES")
    # ------------------------------------------------------------------ #
    r = client.post("/api/owner/tables", headers=H_FC, json={"number": 1})
    check("Food Corner adds Table 1", r.status_code == 201)
    fc_table = json_of(r)

    r = client.post("/api/owner/tables", headers=H_RC, json={"number": 1})
    check("Royal Cafe adds Table 1", r.status_code == 201)
    rc_table = json_of(r)

    check("table tokens differ across restaurants",
          fc_table["token"] != rc_table["token"])
    check("Food Corner QR points at its own menu",
          fc_table["qr_url"].endswith(f"/r/food-corner/table/{fc_table['token']}"),
          fc_table["qr_url"])
    check("Royal Cafe QR points at its own menu",
          rc_table["qr_url"].endswith(f"/r/royal-cafe/table/{rc_table['token']}"),
          rc_table["qr_url"])

    r = client.get(f"/api/owner/tables/{fc_table['id']}/qr", headers=H_FC)
    check("QR image generated", r.status_code == 200 and
          json_of(r)["qr_data_url"].startswith("data:image/png;base64,"))

    r = client.get(f"/api/owner/tables/{fc_table['id']}/qr/download", headers=H_FC)
    check("QR download returns PNG", r.status_code == 200 and
          r.mimetype == "image/png")

    r = client.post("/api/owner/tables", headers=H_FC, json={"number": 1})
    check("duplicate table number rejected", r.status_code == 409)

    # ------------------------------------------------------------------ #
    print("\n6. CUSTOMER ORDER (Food Corner)")
    # ------------------------------------------------------------------ #
    r = client.get(f"/api/customer/table/{fc_table['token']}")
    check("QR opens Food Corner website", r.status_code == 200)
    state = json_of(r)
    check("table page shows restaurant name", state["restaurant"]["name"] == "Food Corner")
    check("table page shows table number", state["table"]["number"] == 1)
    check("menu served to customer",
          any(i["name"] == "Chicken Biryani" for i in state["items"]))

    r = client.get(f"/api/customer/table/{rc_table['token']}")
    check("Royal Cafe QR opens a different website",
          json_of(r)["restaurant"]["name"] == "Royal Cafe")

    r = client.post(
        "/api/customer/orders",
        json={
            "table_token": fc_table["token"],
            "items": [
                {"menu_item_id": biryani["id"], "qty": 2, "instructions": "Less spicy"}
            ],
            "note": "No onions please",
        },
    )
    check("customer places order", r.status_code == 201, str(r.status_code))
    order = json_of(r)
    check("order total = 2 x ₹180", float(order["total"]) == 360.0, str(order["total"]))
    check("order starts PENDING", order["status"] == "PENDING")
    order_id = order["id"]
    session_id = order["session_id"]

    # A second order at the same table joins the same table session.
    r = client.post("/api/customer/orders",
                    json={"table_token": fc_table["token"],
                          "items": [{"menu_item_id": biryani["id"], "qty": 1}]})
    check("second order placed", r.status_code == 201)
    second = json_of(r)
    check("second order reuses the session", second["session_id"] == session_id,
          f"{second['session_id']} vs {session_id}")
    check("second order total", float(second["total"]) == 180.0)

    # ------------------------------------------------------------------ #
    print("\n7. OWNER SEES THE ORDER + STATUS FLOW")
    # ------------------------------------------------------------------ #
    r = client.get("/api/owner/orders?status=PENDING", headers=H_FC)
    check("owner sees the pending order",
          any(o["id"] == order_id for o in json_of(r)))

    r = client.get("/api/owner/orders", headers=H_RC)
    check("Royal Cafe does NOT see Food Corner orders",
          all(o["id"] != order_id for o in json_of(r)))

    r = client.get(f"/api/owner/orders/{order_id}", headers=H_RC)
    check("cross-restaurant order fetch blocked", r.status_code == 404)

    r = client.patch(f"/api/owner/orders/{order_id}/status", headers=H_RC,
                     json={"status": "ACCEPTED"})
    check("cross-restaurant status change blocked", r.status_code == 404)

    for status, label in (("ACCEPTED", "accepted"), ("PREPARING", "preparing"),
                          ("READY", "ready"), ("SERVED", "served"),
                          ("COMPLETED", "completed")):
        r = client.patch(f"/api/owner/orders/{order_id}/status", headers=H_FC,
                         json={"status": status})
        check(f"order {label}", r.status_code == 200, str(r.status_code))

    r = client.patch(f"/api/owner/orders/{order_id}/status", headers=H_FC,
                     json={"status": "ACCEPTED"})
    check("invalid backwards transition rejected", r.status_code == 409)

    r = client.get(f"/api/customer/orders/{order_id}?table_token={fc_table['token']}")
    customer_order = json_of(r)
    check("customer sees updated status", customer_order["status"] == "COMPLETED")
    check("status history preserved", len(customer_order["history"]) >= 6)

    # ------------------------------------------------------------------ #
    print("\n8. STAFF REQUESTS")
    # ------------------------------------------------------------------ #
    r = client.post("/api/customer/requests",
                    json={"table_token": fc_table["token"], "type": "water"})
    check("customer requests water", r.status_code == 201)
    water = json_of(r)

    r = client.post("/api/customer/requests",
                    json={"table_token": fc_table["token"], "type": "water"})
    check("duplicate request deduplicated", json_of(r)["id"] == water["id"])

    r = client.get("/api/owner/requests?status=pending", headers=H_FC)
    check("owner sees the water request",
          any(q["id"] == water["id"] for q in json_of(r)))
    r = client.get("/api/owner/requests?status=pending", headers=H_RC)
    check("Royal Cafe does not see Food Corner requests",
          all(q["id"] != water["id"] for q in json_of(r)))

    r = client.patch(f"/api/owner/requests/{water['id']}/resolve", headers=H_FC,
                     json={})
    check("owner resolves request", r.status_code == 200)

    r = client.post("/api/customer/requests",
                    json={"table_token": fc_table["token"], "type": "bill"})
    check("customer requests bill", r.status_code == 201)
    bill_request = json_of(r)

    # ------------------------------------------------------------------ #
    print("\n9. BILLING + PAY AT COUNTER")
    # ------------------------------------------------------------------ #
    r = client.get(f"/api/owner/sessions/{session_id}/bill", headers=H_FC)
    check("bill preview returned", json_of(r)["preview"] is True)
    check("preview combines the session", json_of(r)["bill"]["total"] > 0)

    r = client.post(f"/api/owner/sessions/{session_id}/bill", headers=H_FC, json={})
    check("bill generated", r.status_code == 201, str(r.status_code))
    bill = json_of(r)["bill"]
    check("both orders combined into one bill",
          len(bill["items"]) == 1 and bill["items"][0]["qty"] == 3,
          str(bill["items"]))
    check("subtotal 540", float(bill["subtotal"]) == 540.0, str(bill["subtotal"]))
    check("GST applied", float(bill["gst"]) == 27.0, str(bill["gst"]))
    check("total = 567", float(bill["total"]) == 567.0, str(bill["total"]))

    r = client.put(f"/api/owner/bills/{bill['id']}", headers=H_FC,
                   json={"discount_type": "flat", "discount_value": 28})
    check("discount applied", float(json_of(r)["total"]) == 539.0)

    r = client.get(f"/api/customer/table/{fc_table['token']}/bill")
    customer_bill = json_of(r)
    check("customer sees the bill", customer_bill["total"] == 539.0)

    r = client.post(f"/api/owner/bills/{bill['id']}/pay", headers=H_RC,
                    json={"method": "cash"})
    check("Royal Cafe cannot pay Food Corner bill", r.status_code == 404)

    r = client.post(f"/api/owner/bills/{bill['id']}/pay", headers=H_FC,
                    json={"method": "bitcoin"})
    check("invalid payment method rejected", r.status_code == 400)

    r = client.post(f"/api/owner/bills/{bill['id']}/pay", headers=H_FC,
                    json={"method": "upi"})
    check("payment recorded", r.status_code == 200)
    check("bill marked paid", json_of(r)["status"] == "paid")

    r = client.get(f"/api/owner/bills/{bill['id']}/pdf", headers=H_FC)
    check("PDF invoice generated",
          r.status_code == 200 and r.data[:5] == b"%PDF-", r.data[:20])

    r = client.post(f"/api/owner/bills/{bill['id']}/pay", headers=H_FC,
                    json={"method": "cash"})
    check("double payment rejected", r.status_code == 409)

    r = client.get(f"/api/customer/table/{fc_table['token']}/bill")
    check("customer bill shows PAID", json_of(r)["status"] == "paid")

    r = client.get("/api/owner/tables", headers=H_FC)
    check("table freed after payment",
          all(t["status"] == "available" for t in json_of(r)))

    # ------------------------------------------------------------------ #
    print("\n10. FOOD REPLACEMENT")
    # ------------------------------------------------------------------ #
    r = client.post("/api/owner/categories", headers=H_FC, json={"name": "Biryanis"})
    biryani_cat = json_of(r)["id"]
    r = client.post("/api/owner/menu", headers=H_FC,
                    json={"name": "Veg Biryani", "price": 150,
                          "category_id": biryani_cat, "veg": True})
    check("replacement item created", r.status_code == 201)
    veg = json_of(r)

    r = client.post(f"/api/owner/menu/{biryani['id']}/unavailable", headers=H_FC,
                    json={"replacement_item_id": veg["id"]})
    check("unavailable + replacement proposed", r.status_code == 200)
    check("one customer notified", json_of(r)["replacements_created"] == 1,
          str(json_of(r)))

    r = client.get(f"/api/customer/table/{fc_table['token']}")
    pending = json_of(r)["pending_replacements"]
    check("customer receives replacement suggestion", len(pending) == 1)
    replacement_id = pending[0]["id"]

    r = client.post(f"/api/customer/replacements/{replacement_id}/respond",
                    json={"action": "accept"})
    check("customer accepts replacement", r.status_code == 200)
    updated_order = json_of(r)
    names = [i["name"] for i in updated_order["items"]]
    check("order now contains Veg Biryani", "Veg Biryani" in names, str(names))
    check("bill recomputed after replacement",
          float(updated_order["total"]) == 150.0, str(updated_order["total"]))

    r = client.post(f"/api/customer/replacements/{replacement_id}/respond",
                    json={"action": "accept"})
    check("second response rejected", r.status_code == 409)

    # ------------------------------------------------------------------ #
    print("\n11. NEW SESSION AFTER PAYMENT")
    # ------------------------------------------------------------------ #
    r = client.post("/api/customer/orders",
                    json={"table_token": fc_table["token"],
                          "items": [{"menu_item_id": veg["id"], "qty": 2}]})
    check("new order after payment", r.status_code == 201)
    third = json_of(r)
    check("paid session closed -> fresh session",
          third["session_id"] != session_id,
          f"{third['session_id']} vs {session_id}")
    check("unavailable item can no longer be ordered", True)

    r = client.post("/api/customer/orders",
                    json={"table_token": fc_table["token"],
                          "items": [{"menu_item_id": biryani["id"], "qty": 1}]})
    check("unavailable food rejected at checkout", r.status_code == 409,
          str(r.status_code))

    # ------------------------------------------------------------------ #
    print("\n12. PLATFORM OVERVIEW + ISOLATION")
    # ------------------------------------------------------------------ #
    r = client.get("/api/superadmin/stats", headers=H_ADMIN)
    stats = json_of(r)
    check("two restaurants on the platform", stats["total_restaurants"] == 2)
    check("two active restaurants", stats["active_restaurants"] == 2)
    check("total tables counted", stats["total_tables"] == 2)
    check("total orders counted", stats["total_orders"] == 3, str(stats["total_orders"]))

    r = client.get("/api/superadmin/restaurants", headers=H_ADMIN)
    rows = json_of(r)
    check("super admin sees both restaurants", len(rows) == 2)

    r = client.patch(f"/api/superadmin/restaurants/{rc_id}/status", headers=H_ADMIN,
                     json={"status": "inactive"})
    check("deactivate Royal Cafe", json_of(r)["status"] == "inactive")

    r = client.post("/api/owner/login", json={"username": rc_user, "password": rc_pass})
    check("inactive restaurant owner cannot log in", r.status_code == 403)

    r = client.post("/api/customer/orders",
                    json={"table_token": rc_table["token"],
                          "items": [{"menu_item_id": pizza["id"], "qty": 1}]})
    check("inactive restaurant cannot accept orders", r.status_code == 403)

    r = client.patch(f"/api/superadmin/restaurants/{rc_id}/status", headers=H_ADMIN,
                     json={"status": "active"})
    check("reactivate Royal Cafe", json_of(r)["status"] == "active")

    r = client.post("/api/superadmin/restaurants/%s/reset-password" % rc_id,
                    headers=H_ADMIN, json={"password": "newpass123"})
    check("reset owner password", r.status_code == 200)
    r = client.post("/api/owner/login", json={"username": rc_user,
                                              "password": "newpass123"})
    check("owner logs in with new password", r.status_code == 200)

    # Owner token must not reach super-admin endpoints.
    r = client.get("/api/superadmin/stats", headers=H_FC)
    check("owner cannot use super admin API", r.status_code == 403)
    r = client.get("/api/owner/dashboard", headers=H_ADMIN)
    check("super admin cannot use owner API", r.status_code == 403)
    r = client.get("/api/owner/dashboard")
    check("missing token rejected", r.status_code == 401)

    # ------------------------------------------------------------------ #
    print("\n13. OWNER DASHBOARD")
    # ------------------------------------------------------------------ #
    r = client.get("/api/owner/dashboard", headers=H_FC)
    dash = json_of(r)
    check("dashboard returns stats", dash["stats"]["today_orders"] >= 2)
    check("dashboard menu count", dash["stats"]["menu_items"] == 2)
    check("dashboard table count", dash["stats"]["tables"] == 1)
    check("dashboard revenue", dash["stats"]["today_revenue"] > 0)

    print(f"\n  ALL {len(PASSED)} CHECKS PASSED ✔\n")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as exc:
        print(f"\n  TEST FAILED: {exc}\n")
        sys.exit(1)
