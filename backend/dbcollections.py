"""Central Firestore collection names (kept out of `collections.py` to avoid
shadowing Python's standard library module)."""

RESTAURANTS = "restaurants"
OWNERS = "restaurant_owners"
CATEGORIES = "categories"
MENU_ITEMS = "menu_items"
TABLES = "tables"
ORDERS = "orders"
ORDER_ITEMS = "order_items"
TABLE_SESSIONS = "table_sessions"
STAFF_REQUESTS = "staff_requests"
REPLACEMENT_REQUESTS = "replacement_requests"
BILLS = "bills"
PAYMENTS = "payments"
AUTH_SESSIONS = "auth_sessions"

# Every restaurant-scoped collection must carry a restaurant_id field.
RESTAURANT_SCOPED = (
    CATEGORIES,
    MENU_ITEMS,
    TABLES,
    ORDERS,
    ORDER_ITEMS,
    TABLE_SESSIONS,
    STAFF_REQUESTS,
    REPLACEMENT_REQUESTS,
    BILLS,
    PAYMENTS,
)
