"""
Real-time layer test — verifies Socket.IO actually delivers:

* owner receives ``order:new`` the instant a customer places an order
* customer receives ``order:update`` when the owner changes the status

Run with:   python tests/test_realtime.py
"""

from __future__ import annotations

import os
import sys
import tempfile
import threading
import time
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="dineflow_rt_"))
os.environ["DINEFLOW_DATA_DIR"] = str(_TMP / "data")
os.environ["DINEFLOW_UPLOAD_FOLDER"] = str(_TMP / "uploads")
os.environ["DINEFLOW_DEBUG"] = "0"
os.environ["DINEFLOW_PORT"] = "5099"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

import requests  # noqa: E402
import socketio as sio  # noqa: E402

from app import app, socketio  # noqa: E402

BASE = "http://127.0.0.1:5099"
PORT = 5099


def wait_for_server(timeout: float = 20.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            if requests.get(f"{BASE}/api/health", timeout=1).status_code == 200:
                return
        except Exception:
            pass
        time.sleep(0.3)
    raise RuntimeError("Backend did not start")


def main() -> None:
    threading.Thread(
        target=lambda: socketio.run(
            app, host="127.0.0.1", port=PORT, debug=False,
            allow_unsafe_werkzeug=True,
        ),
        daemon=True,
    ).start()
    wait_for_server()
    print("  backend up on port", PORT)

    # --- seed a restaurant through the API ----------------------------- #
    admin = requests.post(
        f"{BASE}/api/superadmin/login",
        json={"username": "bivash", "password": "dineflow@123"},
    ).json()["data"]["token"]
    HA = {"Authorization": f"Bearer {admin}"}

    created = requests.post(
        f"{BASE}/api/superadmin/restaurants",
        headers=HA,
        json={"name": "Realtime Diner", "owner_name": "Sam"},
    ).json()["data"]
    credentials = created["credentials"]

    owner_token = requests.post(
        f"{BASE}/api/owner/login", json=credentials
    ).json()["data"]["token"]
    HO = {"Authorization": f"Bearer {owner_token}"}

    category = requests.post(
        f"{BASE}/api/owner/categories", headers=HO, json={"name": "Grill"}
    ).json()["data"]
    item = requests.post(
        f"{BASE}/api/owner/menu",
        headers=HO,
        json={"name": "Paneer Tikka", "price": 220, "category_id": category["id"]},
    ).json()["data"]
    table = requests.post(
        f"{BASE}/api/owner/tables", headers=HO, json={"number": 7}
    ).json()["data"]

    # --- owner socket --------------------------------------------------- #
    owner_events: list[tuple[str, dict]] = []
    owner_sock = sio.Client()
    owner_sock.on("order:new", lambda data: owner_events.append(("order:new", data)))
    owner_sock.on("order:update", lambda data: owner_events.append(("order:update", data)))
    owner_sock.on("request:new", lambda data: owner_events.append(("request:new", data)))
    owner_sock.connect(BASE, auth={"token": owner_token})
    owner_sock.emit("join", {"role": "owner", "token": owner_token})

    # --- customer socket ------------------------------------------------ #
    customer_events: list[tuple[str, dict]] = []
    cust_sock = sio.Client()
    cust_sock.on("order:update", lambda data: customer_events.append(("order:update", data)))
    cust_sock.on("request:update", lambda data: customer_events.append(("request:update", data)))
    cust_sock.connect(BASE)
    cust_sock.emit(
        "join",
        {
            "role": "customer",
            "restaurant_id": created["restaurant"]["id"],
            "table_token": table["token"],
        },
    )
    time.sleep(0.5)

    # --- customer places an order --------------------------------------- #
    response = requests.post(
        f"{BASE}/api/customer/orders",
        json={
            "table_token": table["token"],
            "items": [{"menu_item_id": item["id"], "qty": 1}],
        },
    )
    assert response.status_code == 201, response.text
    order = response.json()["data"]

    deadline = time.time() + 8
    while time.time() < deadline and not owner_events:
        time.sleep(0.1)
    assert owner_events, "owner never received order:new"
    assert owner_events[0][0] == "order:new"
    assert owner_events[0][1]["id"] == order["id"]
    print("  PASS  owner received order:new instantly")

    # --- owner advances the status -------------------------------------- #
    for status in ("ACCEPTED", "PREPARING", "READY"):
        r = requests.patch(
            f"{BASE}/api/owner/orders/{order['id']}/status",
            headers=HO,
            json={"status": status},
        )
        assert r.status_code == 200, r.text

    deadline = time.time() + 8
    while time.time() < deadline:
        if any(e[1].get("status") == "READY" for e in customer_events):
            break
        time.sleep(0.1)
    assert any(e[1].get("status") == "READY" for e in customer_events), (
        f"customer never received the READY update: {customer_events}"
    )
    print("  PASS  customer received live status updates (PENDING -> READY)")

    # --- customer calls staff ------------------------------------------- #
    r = requests.post(
        f"{BASE}/api/customer/requests",
        json={"table_token": table["token"], "type": "call_staff"},
    )
    assert r.status_code == 201, r.text

    deadline = time.time() + 8
    while time.time() < deadline and not any(
        e[0] == "request:new" for e in owner_events
    ):
        time.sleep(0.1)
    assert any(e[0] == "request:new" for e in owner_events), (
        f"owner never received request:new: {owner_events}"
    )
    print("  PASS  owner received the call-staff request instantly")

    # --- isolation: another restaurant's socket cannot join this room ---- #
    intruder = requests.post(
        f"{BASE}/api/superadmin/restaurants",
        headers=HA,
        json={"name": "Other Place", "owner_name": "Max"},
    ).json()["data"]
    intruder_token = requests.post(
        f"{BASE}/api/owner/login", json=intruder["credentials"]
    ).json()["data"]["token"]
    bad = requests.get(
        f"{BASE}/api/owner/orders/{order['id']}",
        headers={"Authorization": f"Bearer {intruder_token}"},
    )
    assert bad.status_code == 404, bad.text
    print("  PASS  another restaurant cannot read this order")

    owner_sock.disconnect()
    cust_sock.disconnect()
    print("\n  REAL-TIME TESTS PASSED ✔\n")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as exc:
        print(f"\n  TEST FAILED: {exc}\n")
        sys.exit(1)
