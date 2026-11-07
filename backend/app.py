"""
DineFlow — Flask backend entry point.

Run with:  python app.py        (defaults to http://localhost:5000)
"""

from __future__ import annotations

import os
from pathlib import Path

from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS

from auth import attach_session
from config import config
from realtime import socketio
from services.qr import qr_directory
from store import get_store
from utils import ok

API_PREFIXES = ("/api", "/uploads", "/qr", "/socket.io")


def create_app() -> Flask:
    app = Flask(__name__, static_folder=None)
    app.config.from_object(config)
    app.config["MAX_CONTENT_LENGTH"] = config.MAX_CONTENT_LENGTH

    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # Session token resolution for every request.
    app.before_request(attach_session)

    # Blueprints -------------------------------------------------------- #
    from routes import billing, customer, menu, orders, owner, super_admin, tables, upload

    app.register_blueprint(super_admin.bp)
    app.register_blueprint(owner.bp)
    app.register_blueprint(menu.bp)
    app.register_blueprint(tables.bp)
    app.register_blueprint(orders.bp)
    app.register_blueprint(billing.bp)
    app.register_blueprint(customer.bp)
    app.register_blueprint(upload.bp)

    # Uploaded images and generated QR codes ---------------------------- #
    upload_dir = Path(config.UPLOAD_FOLDER)
    qr_dir = qr_directory()

    @app.get("/uploads/<path:filename>")
    def uploaded_file(filename: str):
        return send_from_directory(upload_dir, filename)

    @app.get("/qr/<path:filename>")
    def qr_file(filename: str):
        return send_from_directory(qr_dir, filename)

    # Health / diagnostics --------------------------------------------- #
    @app.get("/api/health")
    def health():
        from services.images import storage_backend

        return ok(
            {
                "status": "up",
                "app": "DineFlow",
                "database": os.environ.get("DINEFLOW_ACTIVE_BACKEND", "unknown"),
                "database_configured": config.resolve_db_backend(),
                "image_storage": storage_backend(),
                "gst_rate": config.GST_RATE,
            },
            "DineFlow API is running",
        )

    # Serve the built React app when it exists (production mode) -------- #
    dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"

    @app.get("/", defaults={"path": ""})
    @app.get("/<path:path>")
    def spa(path: str):
        if path.startswith(API_PREFIXES):
            return jsonify({"success": False, "message": "Not found"}), 404
        if dist.exists():
            target = dist / path
            if path and target.is_file():
                return send_from_directory(dist, path)
            return send_from_directory(dist, "index.html")
        return (
            jsonify(
                {
                    "success": True,
                    "message": "DineFlow API is running. "
                               "Start the frontend with `npm run dev` in /frontend.",
                }
            ),
            200,
        )

    # JSON error handling ----------------------------------------------- #
    @app.errorhandler(404)
    def not_found(_e):
        if str(getattr(_e, "description", "")).find("api") >= 0:
            pass
        return jsonify({"success": False, "message": "Resource not found"}), 404

    @app.errorhandler(405)
    def method_not_allowed(_e):
        return jsonify({"success": False, "message": "Method not allowed"}), 405

    @app.errorhandler(500)
    def server_error(_e):
        return jsonify({"success": False, "message": "Internal server error"}), 500

    # Eagerly initialise the database so misconfiguration surfaces early.
    get_store()

    socketio.init_app(app)
    return app


app = create_app()


if __name__ == "__main__":
    print(f"\n  DineFlow API  ->  http://localhost:{config.PORT}")
    print(f"  Database      ->  {os.environ.get('DINEFLOW_ACTIVE_BACKEND', '?')}")
    print(f"  Images        ->  {'cloudinary' if config.cloudinary_configured() else 'local'}\n")
    socketio.run(
        app,
        host=config.HOST,
        port=config.PORT,
        debug=config.DEBUG,
        allow_unsafe_werkzeug=True,
    )
