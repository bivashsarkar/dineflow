"""
Persistence layer for DineFlow.

Two interchangeable backends expose the exact same interface:

* :class:`FirestoreStore` -> Firebase Firestore via the Admin SDK (production)
* :class:`LocalStore`     -> JSON files on disk (development / no Firebase project)

Every higher-level module (routes, services) talks only to the ``store``
object returned by :func:`get_store`, so switching backends never requires a
code change. This also guarantees there is a single source of truth for data
access rules (restaurant isolation, ownership checks, ...).
"""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any, Iterable

from config import config

# --------------------------------------------------------------------------- #
# Document helpers
# --------------------------------------------------------------------------- #

OPS = {"==", "!=", "<", "<=", ">", ">=", "in", "not-in", "array-contains"}


def _local_path(name: str) -> Path:
    config.LOCAL_DATA_DIR.mkdir(parents=True, exist_ok=True)
    return config.LOCAL_DATA_DIR / f"{name}.json"


class LocalStore:
    """A tiny Firestore-shaped document store backed by JSON files."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._cache: dict[str, list[dict[str, Any]]] = {}

    # -- persistence ---------------------------------------------------- #
    def _load(self, name: str) -> list[dict[str, Any]]:
        with self._lock:
            if name in self._cache:
                return self._cache[name]
            path = _local_path(name)
            docs: list[dict[str, Any]] = []
            if path.exists():
                try:
                    docs = json.loads(path.read_text(encoding="utf-8"))
                except (json.JSONDecodeError, OSError):
                    docs = []
            self._cache[name] = docs
            return docs

    def _flush(self, name: str) -> None:
        with self._lock:
            path = _local_path(name)
            tmp = path.with_suffix(".tmp")
            tmp.write_text(
                json.dumps(self._cache.get(name, []), ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            tmp.replace(path)

    # -- public API ------------------------------------------------------ #
    def get(self, collection: str, doc_id: str) -> dict[str, Any] | None:
        with self._lock:
            for doc in self._load(collection):
                if doc.get("id") == doc_id:
                    return dict(doc)
        return None

    def add(self, collection: str, data: dict[str, Any], doc_id: str | None = None) -> str:
        with self._lock:
            docs = self._load(collection)
            if doc_id is None:
                doc_id = data.get("id") or _generate_id(collection, docs)
            record = {"id": doc_id, **data}
            record["id"] = doc_id
            docs.append(record)
            self._flush(collection)
            return doc_id

    def set(self, collection: str, doc_id: str, data: dict[str, Any]) -> str:
        with self._lock:
            docs = self._load(collection)
            for i, doc in enumerate(docs):
                if doc.get("id") == doc_id:
                    docs[i] = {"id": doc_id, **data, "id": doc_id}
                    self._flush(collection)
                    return doc_id
            docs.append({"id": doc_id, **data, "id": doc_id})
            self._flush(collection)
            return doc_id

    def update(self, collection: str, doc_id: str, data: dict[str, Any]) -> bool:
        with self._lock:
            docs = self._load(collection)
            for i, doc in enumerate(docs):
                if doc.get("id") == doc_id:
                    docs[i] = {**doc, **data, "id": doc_id}
                    self._flush(collection)
                    return True
            return False

    def delete(self, collection: str, doc_id: str) -> bool:
        with self._lock:
            docs = self._load(collection)
            new_docs = [d for d in docs if d.get("id") != doc_id]
            changed = len(new_docs) != len(docs)
            if changed:
                self._cache[collection] = new_docs
                self._flush(collection)
            return changed

    def query(
        self,
        collection: str,
        filters: Iterable[tuple[str, str, Any]] = (),
        order_by: str | None = None,
        descending: bool = False,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        with self._lock:
            results = [dict(d) for d in self._load(collection)]

        for field, op, value in filters:
            results = [d for d in results if _match(d.get(field), op, value)]

        if order_by:
            results.sort(
                key=lambda d: (_sort_key(d.get(order_by)), d.get("id") or ""),
                reverse=descending,
            )

        if limit is not None:
            results = results[:limit]
        return results

    def count(self, collection: str, filters: Iterable[tuple[str, str, Any]] = ()) -> int:
        return len(self.query(collection, filters))


class FirestoreStore:
    """Firestore-backed store. Requires the Firebase Admin SDK credentials."""

    def __init__(self) -> None:
        import firebase_admin
        from firebase_admin import credentials, firestore

        if not firebase_admin._DEFAULT_APP:  # type: ignore[attr-defined]
            if config.FIREBASE_CREDENTIALS and Path(config.FIREBASE_CREDENTIALS).exists():
                cred = credentials.Certificate(config.FIREBASE_CREDENTIALS)
                firebase_admin.initialize_app(
                    cred, {"project_id": config.FIREBASE_PROJECT_ID or None}
                )
            else:
                firebase_admin.initialize_app()
        self._db = firestore.client()

    def _col(self, name: str):
        return self._db.collection(name)

    @staticmethod
    def _snap(snap) -> dict[str, Any] | None:
        if not snap.exists:
            return None
        data = snap.to_dict() or {}
        data["id"] = snap.id
        return data

    def get(self, collection: str, doc_id: str) -> dict[str, Any] | None:
        return self._snap(self._col(collection).document(doc_id).get())

    def add(self, collection: str, data: dict[str, Any], doc_id: str | None = None) -> str:
        if doc_id:
            self._col(collection).document(doc_id).set(data)
            return doc_id
        _, ref = self._col(collection).add(data)
        return ref.id

    def set(self, collection: str, doc_id: str, data: dict[str, Any]) -> str:
        self._col(collection).document(doc_id).set(data)
        return doc_id

    def update(self, collection: str, doc_id: str, data: dict[str, Any]) -> bool:
        ref = self._col(collection).document(doc_id)
        if not ref.get().exists:
            return False
        ref.update(data)
        return True

    def delete(self, collection: str, doc_id: str) -> bool:
        ref = self._col(collection).document(doc_id)
        if not ref.get().exists:
            return False
        ref.delete()
        return True

    def query(
        self,
        collection: str,
        filters: Iterable[tuple[str, str, Any]] = (),
        order_by: str | None = None,
        descending: bool = False,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        ref = self._col(collection)
        for field, op, value in filters:
            ref = ref.where(field, op, value)
        if order_by:
            ref = ref.order_by(order_by, direction="DESCENDING" if descending else "ASCENDING")
        if limit:
            ref = ref.limit(limit)
        return [d for d in (self._snap(s) for s in ref.stream()) if d]

    def count(self, collection: str, filters: Iterable[tuple[str, str, Any]] = ()) -> int:
        return len(self.query(collection, filters))


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _match(actual: Any, op: str, expected: Any) -> bool:
    if op == "==":
        return actual == expected
    if op == "!=":
        return actual != expected
    if op == "in":
        return actual in (expected or [])
    if op == "not-in":
        return actual not in (expected or [])
    if op == "array-contains":
        return isinstance(actual, list) and expected in actual
    if actual is None:
        return False
    try:
        if op == "<":
            return actual < expected
        if op == "<=":
            return actual <= expected
        if op == ">":
            return actual > expected
        if op == ">=":
            return actual >= expected
    except TypeError:
        return False
    raise ValueError(f"Unsupported operator: {op}")


def _sort_key(value: Any) -> Any:
    """Sort numbers before strings; never mixes incomparable types."""
    if value is None:
        return (2, "")
    if isinstance(value, bool):
        return (0, int(value))
    if isinstance(value, (int, float)):
        return (0, value)
    return (1, str(value))


def _generate_id(prefix: str, existing: list[dict[str, Any]]) -> str:
    import secrets

    return f"{prefix[:3]}_{secrets.token_hex(6)}"


_store: LocalStore | FirestoreStore | None = None


def get_store() -> LocalStore | FirestoreStore:
    """Return the process-wide store instance (created on first use)."""
    global _store
    if _store is None:
        backend = config.resolve_db_backend()
        if backend == "firestore":
            _store = FirestoreStore()
        else:
            _store = LocalStore()
        # Expose which backend is live for the /api/health endpoint.
        os.environ["DINEFLOW_ACTIVE_BACKEND"] = backend
    return _store
